"""AI-generated gnome name + backstory."""

import logging

from google.genai import types

from app.agent import llm
from app.agent.prompts import fallback_persona, persona_prompt, random_first_name
from app.config import get_config, is_placeholder
from app.models import GnomeMode, Persona

log = logging.getLogger(__name__)


async def generate_persona(guidance: str = "", mode: GnomeMode = "destroyer") -> Persona:
    if is_placeholder(get_config().gemini_api_key):
        return fallback_persona()
    prompt = persona_prompt(mode).format(
        first_name=random_first_name(),
        guidance=f"Operator guidance: {guidance}" if guidance else "",
    )
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
        return fallback_persona()
