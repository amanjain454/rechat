import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.client import get_supabase_client
from app.generation.router import router as generation_router
from app.ingestion.embeddings import generate_embeddings
from app.retrieval.router import router as retrieval_router
from app.retrieval.service import prime_figure_id_cache

logger = logging.getLogger("uvicorn.error")

_warmup_lock = Lock()
_warmup_result: dict | None = None

app = FastAPI(
    title="Perspective API",
    version="0.1.0",
)


def get_allowed_origins() -> list[str]:
    """
    Read comma-separated frontend origins from the environment.
    """
    configured_origins = os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000",
    )

    return [
        origin.strip()
        for origin in configured_origins.split(",")
        if origin.strip()
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    expose_headers=["X-Response-Time-Ms"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_timing(
    request: Request,
    call_next,
):
    started = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.exception(
            "PERF request method=%s path=%s failed after %.1fms",
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise

    elapsed_ms = (time.perf_counter() - started) * 1000

    response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.1f}"

    logger.info(
        "PERF request method=%s path=%s status=%s total_ms=%.1f",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )

    return response


app.include_router(retrieval_router)
app.include_router(generation_router)


def _warm_supabase() -> tuple[list[dict], float]:
    started = time.perf_counter()

    supabase = get_supabase_client()

    response = (
        supabase.table("figures")
        .select("id, slug")
        .eq("is_active", True)
        .execute()
    )

    figures = response.data or []
    prime_figure_id_cache(figures)

    elapsed_ms = (
        time.perf_counter() - started
    ) * 1000

    return figures, elapsed_ms


def _warm_openai() -> float:
    started = time.perf_counter()

    # A tiny embedding request establishes the shared OpenAI HTTP connection.
    # The result is intentionally discarded.
    generate_embeddings(
        ["Perspective backend warmup"]
    )

    return (
        time.perf_counter() - started
    ) * 1000


@app.get("/warmup")
def warmup_backend() -> dict:
    """
    Warm expensive outbound dependencies once per backend process.

    Intended to be called in the background when the frontend loads. On
    Render Free, the HTTP request also wakes a sleeping service.
    """
    global _warmup_result

    if _warmup_result is not None:
        return {
            **_warmup_result,
            "cached": True,
        }

    with _warmup_lock:
        if _warmup_result is not None:
            return {
                **_warmup_result,
                "cached": True,
            }

        total_started = time.perf_counter()

        # Supabase and OpenAI are independent, so warm them concurrently.
        with ThreadPoolExecutor(
            max_workers=2
        ) as executor:
            supabase_future = executor.submit(
                _warm_supabase
            )
            openai_future = executor.submit(
                _warm_openai
            )

            figures, supabase_ms = (
                supabase_future.result()
            )
            openai_ms = openai_future.result()

        total_ms = (
            time.perf_counter() - total_started
        ) * 1000

        _warmup_result = {
            "status": "warm",
            "figure_count": len(figures),
            "supabase_ms": round(
                supabase_ms,
                1,
            ),
            "openai_embedding_ms": round(
                openai_ms,
                1,
            ),
            "total_ms": round(
                total_ms,
                1,
            ),
        }

        logger.info(
            (
                "PERF warmup figures=%s "
                "supabase_ms=%.1f "
                "openai_embedding_ms=%.1f "
                "total_ms=%.1f"
            ),
            len(figures),
            supabase_ms,
            openai_ms,
            total_ms,
        )

        return {
            **_warmup_result,
            "cached": False,
        }


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/config-status")
def config_status() -> dict[str, bool]:
    return {
        "supabase_url_configured": bool(
            settings.supabase_url
        ),
        "supabase_publishable_key_configured": bool(
            settings.supabase_publishable_key
        ),
        "supabase_secret_key_configured": bool(
            settings.supabase_secret_key
        ),
    }


@app.get("/figures")
def get_figures() -> dict[str, list[dict]]:
    """
    Retrieve all active perspectives and prime the local slug -> id cache.
    """
    started = time.perf_counter()

    try:
        client_started = time.perf_counter()
        supabase = get_supabase_client()
        supabase_client_ms = (
            time.perf_counter() - client_started
        ) * 1000

        database_started = time.perf_counter()

        response = (
            supabase.table("figures")
            .select(
                "id, slug, display_name, full_name, "
                "birth_year, death_year, short_description, "
                "is_active"
            )
            .eq("is_active", True)
            .execute()
        )

        database_ms = (
            time.perf_counter() - database_started
        ) * 1000

        figures = response.data or []

        # We already paid for this query at page load, so reuse its IDs later.
        prime_figure_id_cache(figures)

        total_ms = (time.perf_counter() - started) * 1000

        logger.info(
            (
                "PERF figures count=%s supabase_client_ms=%.1f "
                "supabase_ms=%.1f total_ms=%.1f"
            ),
            len(figures),
            supabase_client_ms,
            database_ms,
            total_ms,
        )

        return {"figures": figures}

    except Exception as exc:
        total_ms = (time.perf_counter() - started) * 1000

        logger.exception(
            "PERF figures failed total_ms=%.1f",
            total_ms,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve perspectives.",
        ) from exc
