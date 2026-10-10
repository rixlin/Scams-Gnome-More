"""Twilio webhooks: incoming call -> TwiML media stream, and call status callbacks."""

from xml.sax.saxutils import quoteattr

from fastapi import APIRouter, Depends, Response

from app.api.deps import twilio_form
from app.config import get_config
from app.core import lifecycle, registry

router = APIRouter(prefix="/twilio", tags=["twilio"])


@router.post("/voice")
async def incoming_call(form: dict[str, str] = Depends(twilio_form)) -> Response:
    session = lifecycle.start_call(form.get("CallSid"), form.get("From"))
    stream_url = get_config().public_ws_base.rstrip("/") + "/ws/twilio"
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Connect>"
        f"<Stream url={quoteattr(stream_url)}>"
        f'<Parameter name="call_id" value="{session.id}"/>'
        "</Stream></Connect></Response>"
    )
    return Response(content=twiml, media_type="application/xml")


@router.post("/status")
async def call_status(form: dict[str, str] = Depends(twilio_form)) -> Response:
    """Safety net: finalize the call if the media stream closed without a clean stop."""
    status = form.get("CallStatus")
    session = registry.get_by_sid(form.get("CallSid", ""))
    if session is not None and status in {"completed", "busy", "failed", "no-answer", "canceled"}:
        await lifecycle.end_call(session, f"twilio_{status}")
    return Response(status_code=204)
