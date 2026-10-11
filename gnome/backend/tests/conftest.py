import os

# Must be set before app.config is first used
os.environ.update({
    "TWILIO_VALIDATE_SIGNATURE": "false",
    "DATABASE_URL": "PLACEHOLDER_DATABASE_URL",
    "PUBLIC_BASE_URL": "https://gnome.test",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.agent.gnome import GnomeAgent  # noqa: E402
from app.agent.prompts import FALLBACK_PERSONA  # noqa: E402
from app.core import lifecycle  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client(monkeypatch):
    async def fake_persona(guidance="", mode="destroyer"):
        return FALLBACK_PERSONA

    async def fake_run(self):  # no Gemini/ElevenLabs in tests
        await self.session.persona_ready.wait()

    async def fake_hang_up(session):
        session.hung_up = True

    monkeypatch.setattr(lifecycle, "generate_persona", fake_persona)
    monkeypatch.setattr(lifecycle, "hang_up", fake_hang_up)
    monkeypatch.setattr(GnomeAgent, "run", fake_run)
    with TestClient(app) as c:
        yield c
