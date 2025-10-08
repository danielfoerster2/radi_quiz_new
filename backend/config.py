from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
import os
from pathlib import Path


@dataclass(frozen=True)
class AppConfig:
    secret_key: str
    database_url: str
    storage_root: Path
    session_lifetime: timedelta
    verification_code_length: int
    session_cookie_name: str
    session_cookie_secure: bool
    environment: str


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    lowered = value.strip().lower()
    if lowered in {"1", "true", "yes", "on"}:
        return True
    if lowered in {"0", "false", "no", "off"}:
        return False
    return default


def load_config() -> AppConfig:
    project_root = Path(__file__).resolve().parent.parent

    default_database = project_root / "storage" / "app.sqlite3"
    database_url = os.getenv("DATABASE_URL", f"sqlite:///{default_database}")

    storage_root = Path(
        os.getenv("STORAGE_ROOT", project_root / "storage" / "users")
    ).resolve()
    storage_root.mkdir(parents=True, exist_ok=True)

    session_minutes = int(os.getenv("SESSION_LIFETIME_MINUTES", "30"))

    verification_code_length = int(os.getenv("VERIFICATION_CODE_LENGTH", "6"))

    session_cookie_name = os.getenv("SESSION_COOKIE_NAME", "session_token")
    session_cookie_secure = _parse_bool(
        os.getenv("SESSION_COOKIE_SECURE"), default=False
    )

    environment = os.getenv("FLASK_ENV", "development")

    secret_key = os.getenv("SECRET_KEY", "dev-secret-key")

    return AppConfig(
        secret_key=secret_key,
        database_url=database_url,
        storage_root=storage_root,
        session_lifetime=timedelta(minutes=session_minutes),
        verification_code_length=verification_code_length,
        session_cookie_name=session_cookie_name,
        session_cookie_secure=session_cookie_secure,
        environment=environment,
    )


__all__ = ["AppConfig", "load_config"]
