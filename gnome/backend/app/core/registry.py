"""Active CallSessions, looked up by our call_id or Twilio's CallSid."""

from uuid import UUID

from app.core.session import CallSession

_by_id: dict[UUID, CallSession] = {}
_by_sid: dict[str, CallSession] = {}


def add(session: CallSession) -> None:
    _by_id[session.id] = session
    if session.call_sid:
        _by_sid[session.call_sid] = session


def get(call_id: UUID) -> CallSession | None:
    return _by_id.get(call_id)


def get_by_sid(call_sid: str) -> CallSession | None:
    return _by_sid.get(call_sid)


def remove(session: CallSession) -> None:
    _by_id.pop(session.id, None)
    if session.call_sid:
        _by_sid.pop(session.call_sid, None)


def active() -> list[CallSession]:
    return list(_by_id.values())
