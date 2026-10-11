"""Tiger Data access. The pool is None when DATABASE_URL is not configured."""

import json
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg

from app.config import get_config, is_placeholder
from app.core.phone import format_phone
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
    """Persist a finished call (gnome + transcript) and its recording in one transaction."""
    persona = session.persona
    duration = int((session.ended_at - session.started_at).total_seconds()) if session.ended_at else None
    personality = {
        "traits": persona.personality_traits,
        "quirks": persona.speaking_quirks,
        "override": session.personality_override,
        "voice_id": session.voice_id,
    } if persona else None
    transcript = [u.model_dump(mode="json") for u in session.transcript]
    wav = session.recording_wav() if session.has_audio else None

    async with _pool().acquire() as conn, conn.transaction():
        await conn.execute(
            """INSERT INTO calls (id, twilio_call_sid, caller_number, gnome_name, gnome_backstory,
                                  gnome_personality, started_at, ended_at, duration_s, end_reason, transcript,
                                  region, country, gnome_number)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)""",
            session.id, session.call_sid, session.caller_number,
            persona.name if persona else None, persona.backstory if persona else None, personality,
            session.started_at, session.ended_at, duration, session.end_reason, transcript,
            session.region, session.country, session.gnome_number,
        )
        if wav is not None:
            await conn.execute(
                "INSERT INTO call_audio (call_id, sample_rate, channels, audio) VALUES ($1, $2, 2, $3)",
                session.id, SAMPLE_RATE, wav,
            )


_SUMMARY_COLS = """c.id, c.twilio_call_sid, c.caller_number, c.region, c.country, c.gnome_number, c.gnome_name,
                   c.started_at, c.ended_at, c.duration_s, c.end_reason"""


async def list_calls(limit: int, offset: int) -> list[dict[str, Any]]:
    rows = await _pool().fetch(
        f"SELECT {_SUMMARY_COLS} FROM calls c ORDER BY c.started_at DESC LIMIT $1 OFFSET $2", limit, offset
    )
    result = []
    for r in rows:
        d = dict(r)
        # Calls saved before numbers were formatted at call start get the same +1 (XXX) XXX-XXXX format
        d["caller_number"] = format_phone(d.get("caller_number"))
        d["gnome_number"] = format_phone(d.get("gnome_number"))
        d["scammer_number"] = d.get("caller_number")
        d["duration_seconds"] = d.get("duration_s")
        d["status"] = "ended" if d.get("ended_at") else "active"
        result.append(d)
    return result


async def get_call(call_id: UUID) -> dict[str, Any] | None:
    row = await _pool().fetchrow(
        f"""SELECT {_SUMMARY_COLS}, c.gnome_backstory, c.gnome_personality, c.transcript,
                   EXISTS (SELECT 1 FROM call_audio a WHERE a.call_id = c.id) AS has_audio
            FROM calls c WHERE c.id = $1""",
        call_id,
    )
    if row is None:
        return None
    call = dict(row)
    backstory, personality = call.pop("gnome_backstory"), call.pop("gnome_personality")
    call["gnome"] = (
        {"name": call["gnome_name"], "backstory": backstory, "personality": personality}
        if call["gnome_name"] else None
    )
    call["caller_number"] = format_phone(call.get("caller_number"))
    call["gnome_number"] = format_phone(call.get("gnome_number"))
    call["scammer_number"] = call.get("caller_number")
    call["duration_seconds"] = call.get("duration_s")
    call["status"] = "ended" if call.get("ended_at") else "active"
    call["recording_status"] = "available" if call.get("has_audio") else "unavailable"
    transcript_data = sorted(call.pop("transcript"), key=lambda u: u["seq"])
    call["transcript"] = transcript_data
    call["utterances"] = list(transcript_data)
    return call


async def delete_call(call_id: UUID) -> bool:
    res = await _pool().execute("DELETE FROM calls WHERE id = $1", call_id)
    return res != "DELETE 0"


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
