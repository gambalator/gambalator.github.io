from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def load_local_environment() -> None:
    """Load a development .env without overriding explicit environment values."""
    configured_path = os.environ.get("GAMBALATOR_ENV_FILE")
    candidates = [Path(configured_path)] if configured_path else []
    candidates.extend((Path.cwd() / ".env", Path.cwd() / "backend" / ".env"))

    for candidate in candidates:
        if candidate.is_file():
            load_dotenv(candidate, override=False)
            return


def default_data_dir() -> Path:
    override = os.environ.get("GAMBALATOR_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()

    if os.name == "nt":
        root = os.environ.get("LOCALAPPDATA")
        if root:
            return Path(root) / "Gambalator"
        return Path.home() / "AppData" / "Local" / "Gambalator"

    root = os.environ.get("XDG_DATA_HOME")
    if root:
        return Path(root) / "gambalator"
    return Path.home() / ".local" / "share" / "gambalator"


def _boolean(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    normalized = value.strip().casefold()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false")


def _positive_float(name: str, default: float) -> float:
    value = float(os.environ.get(name, default))
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


def _positive_int(name: str, default: int) -> int:
    value = int(os.environ.get(name, default))
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


def _default_frontend_dir() -> Path:
    configured = os.environ.get("GAMBALATOR_FRONTEND_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.cwd() / "dist").resolve()


@dataclass(frozen=True, slots=True)
class Settings:
    data_dir: Path
    frontend_dir: Path
    access_token: str | None
    api_base_url: str = "https://www.donationalerts.com/api/v1"
    oauth_base_url: str = "https://www.donationalerts.com"
    oauth_redirect_uri: str = "http://127.0.0.1:5741/api/oauth/callback"
    credential_store: str = "auto"
    poll_interval_seconds: float = 5.0
    request_timeout_seconds: float = 15.0
    import_existing: bool = False
    max_pages_per_sync: int = 1000
    host: str = "127.0.0.1"
    port: int = 5741

    @property
    def database_path(self) -> Path:
        return self.data_dir / "gambalator.sqlite3"

    @classmethod
    def from_environment(cls) -> Settings:
        token = os.environ.get("GAMBALATOR_DA_ACCESS_TOKEN", "").strip() or None
        port = _positive_int("GAMBALATOR_PORT", 5741)
        if port > 65535:
            raise ValueError("GAMBALATOR_PORT must not exceed 65535")

        credential_store = os.environ.get("GAMBALATOR_CREDENTIAL_STORE", "auto")
        if credential_store not in {"auto", "keyring", "file"}:
            raise ValueError("GAMBALATOR_CREDENTIAL_STORE must be auto, keyring, or file")

        return cls(
            data_dir=default_data_dir(),
            frontend_dir=_default_frontend_dir(),
            access_token=token,
            api_base_url=os.environ.get(
                "GAMBALATOR_DA_API_BASE_URL",
                "https://www.donationalerts.com/api/v1",
            ).rstrip("/"),
            oauth_base_url=os.environ.get(
                "GAMBALATOR_DA_OAUTH_BASE_URL",
                "https://www.donationalerts.com",
            ).rstrip("/"),
            oauth_redirect_uri=os.environ.get(
                "GAMBALATOR_DA_REDIRECT_URI",
                f"http://127.0.0.1:{port}/api/oauth/callback",
            ),
            credential_store=credential_store,
            poll_interval_seconds=_positive_float(
                "GAMBALATOR_POLL_INTERVAL_SECONDS", 5.0
            ),
            request_timeout_seconds=_positive_float(
                "GAMBALATOR_REQUEST_TIMEOUT_SECONDS", 15.0
            ),
            import_existing=_boolean("GAMBALATOR_IMPORT_EXISTING", False),
            max_pages_per_sync=_positive_int("GAMBALATOR_MAX_PAGES_PER_SYNC", 1000),
            host=os.environ.get("GAMBALATOR_HOST", "127.0.0.1"),
            port=port,
        )
