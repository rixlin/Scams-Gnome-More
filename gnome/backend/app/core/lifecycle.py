"""Call start/end orchestration. end_call() is the single, idempotent end-of-call path."""

import asyncio
import logging
import random
from datetime import datetime, timezone

from twilio.rest import Client as TwilioClient

from app.agent.persona import generate_persona
from app.config import get_config
from app.core import registry, settings_store
from app.core.session import CallSession
from app.db import repo
from app.models import Persona

log = logging.getLogger(__name__)


def start_call(
    call_sid: str | None,
    caller_number: str | None,
    gnome_number: str | None = None,
    region: str | None = None,
    country: str | None = None,
) -> CallSession:
    session = CallSession(
        call_sid=call_sid,
        caller_number=caller_number,
        gnome_number=gnome_number,
        region=region,
        country=country,
    )
    st = settings_store.get()
    voices = get_config().elevenlabs_voice_ids
    # A voice pinned in settings wins; otherwise each call gets a random voice from .env
    session.voice_id = st["voice_id"] or (random.choice(voices) if voices else None)
    registry.add(session)
    session.tasks.append(asyncio.create_task(_prepare_persona(session)))
    session.tasks.append(asyncio.create_task(_telemetry_ticker(session)))
    session.tasks.append(asyncio.create_task(_max_length_timer(session, st["max_call_seconds"])))
    log.info("call %s started (sid=%s, voice=%s)", session.id, call_sid, session.voice_id)
    return session


async def _prepare_persona(session: CallSession) -> None:
    st = settings_store.get()
    if not st["generate_new_gnome_per_call"] and st["fixed_gnome"]:
        session.persona = Persona.model_validate(st["fixed_gnome"])
    else:
        session.persona = await generate_persona(st["default_personality"])
    session.persona_ready.set()
    session.publish("call.started", session.started_payload())


async def _telemetry_ticker(session: CallSession) -> None:
    while not session.ended:
        session.publish("telemetry", session.telemetry())
        await asyncio.sleep(1)


async def _max_length_timer(session: CallSession, seconds: int) -> None:
    await asyncio.sleep(seconds)
    log.info("call %s hit max length (%ss)", session.id, seconds)
    await hang_up(session)
    await end_call(session, "max_length")


async def hang_up(session: CallSession) -> None:
    """Ask Twilio to end the phone call."""
    if not session.call_sid:
        return
    cfg = get_config()

    def _complete() -> None:
        TwilioClient(cfg.twilio_account_sid, cfg.twilio_auth_token).calls(session.call_sid).update(status="completed")

    try:
        await asyncio.to_thread(_complete)
    except Exception:
        log.exception("failed to hang up call %s via Twilio", session.id)


async def end_call(session: CallSession, reason: str) -> None:
    async with session.end_lock:
        if session.ended:
            return
        session.ended = True
        session.end_reason = reason
        session.ended_at = datetime.now(timezone.utc)

    current = asyncio.current_task()
    for task in session.tasks:
        if task is not current:
            task.cancel()
    if session.agent is not None:
        await session.agent.close()
    session.set_gnome_speaking(False)
    session.set_state("idle")
    session.publish("call.ended", {
        "reason": reason, "duration_s": round(session.elapsed(), 1),
    })
    registry.remove(session)
    log.info("call %s ended (%s), %d utterances", session.id, reason, len(session.transcript))

    if repo.pool is None:
        log.warning("database not configured; call %s not persisted", session.id)
        return
    try:
        await repo.save_call(session)
    except Exception:
        log.exception("failed to persist call %s", session.id)
