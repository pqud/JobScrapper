from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "JobScrap Sync API"
    api_prefix: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Firebase
    firebase_project_id: str = ""
    google_application_credentials: str = ""
    # Local/dev: skip Firebase verify and accept Bearer demo:<uid>
    auth_dev_mode: bool = True

    # Firestore: use emulator or in-memory store
    use_memory_store: bool = True
    firestore_emulator_host: str = ""

    # Enrichment
    worker_base_url: str = "http://127.0.0.1:8000"
    use_cloud_tasks: bool = False
    gcp_project: str = ""
    gcp_location: str = "asia-northeast3"
    bot_user_agent: str = (
        "JobScrapSync/1.0 (+https://localhost/bot; contact@localhost)"
    )
    # Sites where server-side HTML fetch is blocked — enrich via browser extension
    browser_enrich_sites: str = "jobkorea,wanted,jobplanet,gamejob"

    @property
    def browser_enrich_site_set(self) -> set[str]:
        return {s.strip() for s in self.browser_enrich_sites.split(",") if s.strip()}


    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
