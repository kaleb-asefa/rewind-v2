"""Typed application settings, read once from ``REWIND_*`` environment variables.

Every tunable lives here so modules never call ``os.getenv`` at import time.
``settings`` is a plain mutable object: tests override fields with
``monkeypatch.setattr(settings, "catalog_path", ...)`` and code reads it at call
time, so overrides take effect immediately.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
DATA_DIR = REPO_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="REWIND_", env_file=BACKEND_DIR / ".env", extra="ignore"
    )

    # HTTP
    allowed_origins: str = ""  # comma-separated; empty = same-origin only (the default deploy)
    frontend_dist: Path | None = None  # built SPA to serve; None = API only

    # Storage
    sessions_dir: Path = DATA_DIR / "sessions"
    catalog_path: Path = DATA_DIR / "metadata" / "catalog_sorted.parquet"

    # DuckDB guardrails for the catalog scan (never exhaust RAM on small boxes)
    duckdb_memory_limit: str = "2GB"
    duckdb_threads: int = 2
    duckdb_temp_dir: Path | None = None

    # Sessions
    engine_cache_max: int = 64
    session_ttl_hours: float = 48
    cleanup_interval_min: float = 60

    # Uploads
    max_concurrent_enrich: int = 1
    max_upload_files: int = 50
    max_upload_mb: float = 512

    # Fixed timezone override (hours); None = infer from dominant conn_country
    tz_offset_hours: float | None = None

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)


settings = Settings()
