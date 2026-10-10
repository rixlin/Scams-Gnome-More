"""Request validation for Twilio webhooks."""

from fastapi import HTTPException, Request, status
from twilio.request_validator import RequestValidator

from app.config import get_config

async def twilio_form(request: Request) -> dict[str, str]:
    """Parse a Twilio webhook form body and verify X-Twilio-Signature.

    Behind the Cloudflare tunnel the local URL differs from what Twilio signed,
    so the signature is checked against PUBLIC_BASE_URL + path.
    """
    cfg = get_config()
    form = {k: str(v) for k, v in (await request.form()).items()}
    if cfg.twilio_validate_signature:
        url = cfg.public_base_url.rstrip("/") + request.url.path
        if request.url.query:
            url += "?" + request.url.query
        signature = request.headers.get("X-Twilio-Signature", "")
        if not RequestValidator(cfg.twilio_auth_token).validate(url, form, signature):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid Twilio signature")
    return form
