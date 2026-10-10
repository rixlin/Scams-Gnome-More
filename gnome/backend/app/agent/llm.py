"""Gemini client wrapper."""

from functools import lru_cache

from google import genai

from app.config import get_config


@lru_cache
def client() -> genai.Client:
    return genai.Client(api_key=get_config().gemini_api_key)
