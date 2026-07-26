import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.client import get_supabase_client
from app.generation.router import router as generation_router
from app.retrieval.router import router as retrieval_router


# Create the FastAPI application.
# This object is what Uvicorn loads when we run:
# uvicorn app.main:app --reload
app = FastAPI(
    title="RecChat API",
    version="0.1.0",
)


def get_allowed_origins() -> list[str]:
    """
    Read comma-separated frontend origins from the environment.

    Local example:
    FRONTEND_ORIGINS=http://localhost:3000

    Production example:
    FRONTEND_ORIGINS=http://localhost:3000,https://rechat.vercel.app
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


# Allow approved frontend applications to call this backend.
#
# Browsers block cross-origin requests by default, so CORS must
# explicitly allow both local and production frontend origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include the retrieval router.
app.include_router(retrieval_router)

# Include the generation router.
app.include_router(generation_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """
    Basic health-check endpoint.

    This confirms that:
    - FastAPI loaded successfully
    - Uvicorn is running
    - the backend can respond to HTTP requests

    It does not test the database or any external service.
    """

    return {"status": "ok"}


@app.get("/config-status")
def config_status() -> dict[str, bool]:
    """
    Check whether required Supabase environment variables are present.

    This endpoint returns only True or False values.
    It never returns or exposes the actual credentials.
    """

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
    Retrieve all active historical personalities from Supabase.

    Current behavior:
    1. Create a trusted Supabase client using backend credentials.
    2. Query the public.figures table.
    3. Return only rows where is_active is True.
    4. Return selected public-facing fields to the caller.

    The Supabase secret key remains on the backend and is never
    sent to the frontend.
    """

    try:
        # Create a Supabase client using the URL and secret key
        # stored in the environment.
        supabase = get_supabase_client()

        # Query the figures table.
        #
        # select(...) limits the returned columns.
        # eq("is_active", True) filters out inactive figures.
        # execute() sends the request to Supabase.
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

        # response.data contains the rows returned by Supabase.
        return {"figures": response.data}

    except Exception as exc:
        # Avoid exposing database credentials or low-level exception
        # details to the frontend.
        #
        # The original exception is retained internally through
        # "from exc", which helps when debugging server logs.
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve figures.",
        ) from exc