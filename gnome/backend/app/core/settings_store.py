"""Global gnome settings: defaults, overlaid with values stored in Tiger Data."""

import logging
from typing import Any

from app.db import repo
from app.models import SettingsUpdate

log = logging.getLogger(__name__)

DEFAULTS: dict[str, Any] = {
    "default_personality": "",
    "voice_id": None,  # None -> random pick from ELEVENLABS_VOICE_ID in .env, per call
    "max_call_seconds": 1800,
    "generate_new_gnome_per_call": True,
    "fixed_gnome": None,
    "aggression": 3,
    "gnome_mode": "destroyer",  # mode new calls start in: "destroyer" or "whimsy"
}

_current: dict[str, Any] = dict(DEFAULTS)


def get() -> dict[str, Any]:
    return dict(_current)


async def load() -> None:
    if repo.pool is None:
        return
    _current.update({k: v for k, v in (await repo.load_settings()).items() if k in DEFAULTS})


async def update(patch: SettingsUpdate) -> dict[str, Any]:
    changes = patch.model_dump(exclude_unset=True, mode="json")
    _current.update(changes)
    if repo.pool is not None and changes:
        await repo.save_settings(changes)
    elif changes:
        log.warning("settings changed in memory only; database not configured")
    return get()
