import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

if __name__ == "__main__":
    # Launched as a script (python app/main.py): make the `app` package importable
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI

from app.api import calls, gnome, settings, twilio_hooks
from app.config import get_config, is_placeholder
from app.core import lifecycle, registry, settings_store
from app.db import repo
from app.demo import router as demo
from app.ws import live, twilio_stream

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("gnome")


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_config()
    optional = {"cloudflare_tunnel", "elevenlabs_voice_id"}  # voice ids may come from numbered keys instead
    missing = [
        name for name in type(cfg).model_fields
        if name not in optional and isinstance(getattr(cfg, name), str) and is_placeholder(getattr(cfg, name))
    ]
    if not cfg.elevenlabs_voice_ids:
        missing.append("elevenlabs_voice_id")
    if missing:
        log.warning("placeholder config values (features using them will fail): %s", ", ".join(missing))
    await repo.connect()
    await settings_store.load()
    yield
    for session in registry.active():
        await lifecycle.end_call(session, "server_shutdown")
    await repo.close()


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Gnome backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(settings.router)
app.include_router(gnome.router)
app.include_router(gnome.mode_router)
app.include_router(calls.router)
app.include_router(twilio_hooks.router)
app.include_router(twilio_stream.router)
app.include_router(live.router)
if get_config().enable_demo:
    app.include_router(demo.router)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "db": repo.pool is not None, "active_calls": len(registry.active())}


@app.get("/api/health")
async def api_health() -> dict:
    return await health()


@app.get("/api/ping")
async def ping() -> dict:
    return {"ok": True, "pong": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
