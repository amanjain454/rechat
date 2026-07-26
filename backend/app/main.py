from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(
    title="RecChat API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/config-status")
def config_status() -> dict[str, bool]:
    return {
        "supabase_url_configured": bool(settings.supabase_url),
        "supabase_publishable_key_configured": bool(
            settings.supabase_publishable_key
        ),
        "supabase_secret_key_configured": bool(
            settings.supabase_secret_key
        ),
        "supabase_jwks_url_configured": bool(
            settings.supabase_jwks_url
        ),
    }