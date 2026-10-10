from typing import Any

from fastapi import APIRouter

from app.core import settings_store
from app.models import SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings() -> dict[str, Any]:
    return settings_store.get()


@router.post("")
async def update_settings(patch: SettingsUpdate) -> dict[str, Any]:
    return await settings_store.update(patch)
