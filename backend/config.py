from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=["../.env", ".env"], env_file_encoding="utf-8", extra="ignore"
    )
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/agentdb"
    APIFY_API_TOKEN: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "agent-screenshots"
    R2_PUBLIC_URL: str = ""


settings = Settings()
