import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    environment: str = os.getenv("ENVIRONMENT", "development")

    supabase_url: str | None = os.getenv("SUPABASE_URL")
    supabase_publishable_key: str | None = os.getenv(
        "SUPABASE_PUBLISHABLE_KEY"
    )
    supabase_secret_key: str | None = os.getenv("SUPABASE_SECRET_KEY")
    supabase_jwks_url: str | None = os.getenv("SUPABASE_JWKS_URL")

    database_url: str | None = os.getenv("DATABASE_URL")
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")


settings = Settings()