"""Call history/details (Tiger Data), active calls, and call termination."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response

from app.core import audio, lifecycle, registry
from app.db import repo
from app.models import ActiveCall, CallDetail, CallSummary

router = APIRouter(prefix="/api/calls", tags=["calls"])


def _db_errors(exc: repo.DatabaseUnavailable) -> HTTPException:
    return HTTPException(503, str(exc))


@router.get("/active", response_model=list[ActiveCall])
async def active_calls() -> list[ActiveCall]:
    return [
        ActiveCall(call_id=s.id, caller_number=s.caller_number, gnome=s.persona, elapsed_s=round(s.elapsed(), 1))
        for s in registry.active()
    ]


@router.get("", response_model=list[CallSummary])
async def list_calls(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    try:
        return await repo.list_calls(limit, offset)
    except repo.DatabaseUnavailable as e:
        raise _db_errors(e)


@router.get("/{call_id}", response_model=CallDetail)
async def call_detail(call_id: UUID):
    try:
        call = await repo.get_call(call_id)
    except repo.DatabaseUnavailable as e:
        raise _db_errors(e)
    if call is None:
        raise HTTPException(404, "call not found")
    return call


@router.get("/{call_id}/audio")
async def call_audio(call_id: UUID, mono: bool = False) -> Response:
    """The call recording: stereo WAV (left = caller, right = gnome), or both mixed into one channel."""
    try:
        wav = await repo.get_call_audio(call_id)
    except repo.DatabaseUnavailable as e:
        raise _db_errors(e)
    if wav is None:
        raise HTTPException(404, "no audio for this call")
    if mono:
        wav = audio.stereo_to_mono_wav(wav)
    return Response(content=wav, media_type="audio/wav")


@router.post("/{call_id}/terminate")
async def terminate(call_id: UUID) -> dict:
    session = registry.get(call_id)
    if session is None:
        raise HTTPException(404, "no active call with that id")
    await lifecycle.hang_up(session)
    await lifecycle.end_call(session, "terminated")
    return {"ok": True}
