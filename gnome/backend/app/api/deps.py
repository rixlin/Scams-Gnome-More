"""Auth: bearer token for the frontend, signature validation for Twilio."""

import hmac

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from twilio.request_validator import RequestValidator

from app.config import get_config

_bearer = HTTPBearer(auto_error=False)


def token_ok(token: str | None) -> bool:
    return token is not None and hmac.compare_digest(token, get_config().api_token)


def require_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    if creds is None or not token_ok(creds.credentials):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or missing token")


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
