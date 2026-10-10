"""AI-generated gnome name + backstory."""

import logging

from google.genai import types

from app.agent import llm
from app.agent.prompts import FALLBACK_PERSONA, PERSONA_PROMPT
from app.config import get_config
from app.models import Persona

log = logging.getLogger(__name__)


async def generate_persona(guidance: str = "") -> Persona:
    prompt = PERSONA_PROMPT.format(guidance=f"Operator guidance: {guidance}" if guidance else "")
    try:
        resp = await llm.client().aio.models.generate_content(
            model=get_config().gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=Persona,
                temperature=1.2,
            ),
        )
        return Persona.model_validate_json(resp.text)
    except Exception:
        log.exception("persona generation failed; using fallback gnome")
        return FALLBACK_PERSONA
