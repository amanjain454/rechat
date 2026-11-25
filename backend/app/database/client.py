from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Create and cache one trusted Supabase client for backend use.

    The client uses the Supabase secret key, so it must only be used
    in server-side code. Reusing one client avoids recreating the
    underlying HTTP client and connection pool on every request.
    """

    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured.")

    if not settings.supabase_secret_key:
        raise RuntimeError("SUPABASE_SECRET_KEY is not configured.")

    return create_client(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
