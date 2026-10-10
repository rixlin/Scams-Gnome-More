"""Tiger Data access. The pool is None when DATABASE_URL is not configured."""

import json
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg

from app.config import get_config, is_placeholder
from app.core.session import SAMPLE_RATE, CallSession

log = logging.getLogger(__name__)

_SCHEMA = (Path(__file__).parent / "schema.sql").read_text()
pool: asyncpg.Pool | None = None


class DatabaseUnavailable(RuntimeError):
    pass


async def _init_conn(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def connect() -> None:
    global pool
    url = get_config().database_url
    if is_placeholder(url):
        log.warning("DATABASE_URL not set; call history will not be persisted")
        return
    pool = await asyncpg.create_pool(url, min_size=1, max_size=5, init=_init_conn)
    async with pool.acquire() as conn:
        await conn.execute(_SCHEMA)
        try:
            await conn.execute("SELECT create_hypertable('utterances', 'ts', if_not_exists => TRUE)")
        except asyncpg.PostgresError as e:
            log.warning("utterances not converted to a hypertable (is TimescaleDB enabled?): %s", e)
    log.info("connected to Tiger Data")


async def close() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None


def _pool() -> asyncpg.Pool:
    if pool is None:
        raise DatabaseUnavailable("database not configured")
    return pool


async def save_call(session: CallSession) -> None:
    """Persist a finished call in one transaction."""
    persona = session.persona
    duration = int((session.ended_at - session.started_at).total_seconds()) if session.ended_at else None
    wav = session.recording_wav() if session.has_audio else None

    async with _pool().acquire() as conn, conn.transaction():
        if persona:
            personality = {
                "traits": persona.personality_traits,
                "quirks": persona.speaking_quirks,
                "override": session.personality_override,
            }
            await conn.execute(
                """INSERT INTO gnomes (id, name, backstory, personality, voice_id)
                   VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING""",
                session.gnome_id, persona.name, persona.backstory, personality, session.voice_id,
            )
        await conn.execute(
            """INSERT INTO calls (id, twilio_call_sid, caller_number, gnome_id,
                                  started_at, ended_at, duration_s, end_reason)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
            session.id, session.call_sid, session.caller_number,
            session.gnome_id if persona else None,
            session.started_at, session.ended_at, duration, session.end_reason,
        )
        await conn.executemany(
            "INSERT INTO utterances (call_id, ts, seq, speaker, gnome_id, text) VALUES ($1, $2, $3, $4, $5, $6)",
            [
                (session.id, u.ts, u.seq, u.speaker, session.gnome_id if u.speaker == "gnome" else None, u.text)
                for u in session.transcript
            ],
        )
        if wav is not None:
            await conn.execute(
                "INSERT INTO call_audio (call_id, sample_rate, channels, audio) VALUES ($1, $2, 2, $3)",
                session.id, SAMPLE_RATE, wav,
            )


_SUMMARY_SQL = """
    SELECT c.id, c.twilio_call_sid, c.caller_number, g.name AS gnome_name,
           c.started_at, c.ended_at, c.duration_s, c.end_reason
    FROM calls c LEFT JOIN gnomes g ON g.id = c.gnome_id
"""


async def list_calls(limit: int, offset: int) -> list[dict[str, Any]]:
    rows = await _pool().fetch(_SUMMARY_SQL + " ORDER BY c.started_at DESC LIMIT $1 OFFSET $2", limit, offset)
    return [dict(r) for r in rows]


async def get_call(call_id: UUID) -> dict[str, Any] | None:
    async with _pool().acquire() as conn:
        row = await conn.fetchrow(_SUMMARY_SQL + " WHERE c.id = $1", call_id)
        if row is None:
            return None
        call = dict(row)
        gnome = await conn.fetchrow(
            "SELECT g.id, g.name, g.backstory, g.personality, g.voice_id FROM gnomes g "
            "JOIN calls c ON c.gnome_id = g.id WHERE c.id = $1",
            call_id,
        )
        utterances = await conn.fetch(
            "SELECT seq, ts, speaker, text FROM utterances WHERE call_id = $1 ORDER BY seq", call_id
        )
        has_audio = await conn.fetchval("SELECT EXISTS (SELECT 1 FROM call_audio WHERE call_id = $1)", call_id)
    call["gnome"] = dict(gnome) if gnome else None
    call["utterances"] = [dict(u) for u in utterances]
    call["has_audio"] = has_audio
    return call


async def get_call_audio(call_id: UUID) -> bytes | None:
    return await _pool().fetchval("SELECT audio FROM call_audio WHERE call_id = $1", call_id)


async def load_settings() -> dict[str, Any]:
    rows = await _pool().fetch("SELECT key, value FROM settings")
    return {r["key"]: r["value"] for r in rows}


async def save_settings(values: dict[str, Any]) -> None:
    await _pool().executemany(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        list(values.items()),
    )
