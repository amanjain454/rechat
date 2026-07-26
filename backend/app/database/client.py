from supabase import Client, create_client

from app.config import settings


def get_supabase_client() -> Client:
    """
    Create and return a trusted Supabase client for backend use.

    This client uses the Supabase secret key, so it must only be
    used in server-side code. It must never be imported into or
    exposed through the Next.js frontend.
    """

    # Fail early with a clear error if the project URL is missing.
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured.")

    # Fail early if the backend-only secret key is missing.
    if not settings.supabase_secret_key:
        raise RuntimeError("SUPABASE_SECRET_KEY is not configured.")

    # Build the Supabase client using values loaded from backend/.env.
    return create_client(
        settings.supabase_url,
        settings.supabase_secret_key,
    )