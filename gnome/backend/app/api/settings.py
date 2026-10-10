from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import require_token
from app.core import settings_store
from app.models import SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_token)])


@router.get("")
async def get_settings() -> dict[str, Any]:
    return settings_store.get()


@router.post("")
async def update_settings(patch: SettingsUpdate) -> dict[str, Any]:
    return await settings_store.update(patch)
