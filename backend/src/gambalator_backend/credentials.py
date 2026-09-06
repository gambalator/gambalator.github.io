from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol

import keyring
from keyring.errors import KeyringError, PasswordDeleteError


class CredentialStorageError(RuntimeError):
    """Raised when OAuth credentials cannot be read or written."""


@dataclass(frozen=True, slots=True)
class OAuthCredentials:
    client_id: str
    client_secret: str
    access_token: str | None = None
    refresh_token: str | None = None
    expires_at: float | None = None


class CredentialStore(Protocol):
    @property
    def storage_name(self) -> str: ...

    @property
    def secure(self) -> bool: ...

    def load(self) -> OAuthCredentials | None: ...

    def save(self, credentials: OAuthCredentials) -> None: ...

    def clear(self) -> None: ...


def _deserialize(raw: str) -> OAuthCredentials:
    try:
        payload = json.loads(raw)
        return OAuthCredentials(
            client_id=str(payload["client_id"]),
            client_secret=str(payload["client_secret"]),
            access_token=payload.get("access_token"),
            refresh_token=payload.get("refresh_token"),
            expires_at=payload.get("expires_at"),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise CredentialStorageError("Stored OAuth credentials are invalid") from error


class SystemKeyringCredentialStore:
    service_name = "Gambalator DonationAlerts"
    account_name = "oauth"

    @property
    def storage_name(self) -> str:
        return "system-keyring"

    @property
    def secure(self) -> bool:
        return True

    def load(self) -> OAuthCredentials | None:
        try:
            raw = keyring.get_password(self.service_name, self.account_name)
        except KeyringError as error:
            raise CredentialStorageError("The system credential store is unavailable") from error
        return None if raw is None else _deserialize(raw)

    def save(self, credentials: OAuthCredentials) -> None:
        try:
            keyring.set_password(
                self.service_name,
                self.account_name,
                json.dumps(asdict(credentials)),
            )
        except KeyringError as error:
            raise CredentialStorageError("The system credential store is unavailable") from error

    def clear(self) -> None:
        try:
            keyring.delete_password(self.service_name, self.account_name)
        except PasswordDeleteError:
            return
        except KeyringError as error:
            raise CredentialStorageError("The system credential store is unavailable") from error


class FileCredentialStore:
    def __init__(self, path: Path):
        self.path = path

    @property
    def storage_name(self) -> str:
        return "local-file"

    @property
    def secure(self) -> bool:
        return False

    def load(self) -> OAuthCredentials | None:
        if not self.path.is_file():
            return None
        try:
            return _deserialize(self.path.read_text(encoding="utf-8"))
        except OSError as error:
            raise CredentialStorageError("The local credential file cannot be read") from error

    def save(self, credentials: OAuthCredentials) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(asdict(credentials)), encoding="utf-8")
            if os.name != "nt":
                self.path.chmod(0o600)
        except OSError as error:
            raise CredentialStorageError("The local credential file cannot be written") from error

    def clear(self) -> None:
        try:
            self.path.unlink(missing_ok=True)
        except OSError as error:
            raise CredentialStorageError("The local credential file cannot be removed") from error


class AutomaticCredentialStore:
    """Prefer the OS keyring and fall back to a private local file."""

    def __init__(self, fallback: FileCredentialStore):
        self.primary = SystemKeyringCredentialStore()
        self.fallback = fallback
        self._active: CredentialStore = self.primary

    @property
    def storage_name(self) -> str:
        return self._active.storage_name

    @property
    def secure(self) -> bool:
        return self._active.secure

    def load(self) -> OAuthCredentials | None:
        try:
            credentials = self.primary.load()
        except CredentialStorageError:
            self._active = self.fallback
            return self.fallback.load()
        if credentials is not None:
            self._active = self.primary
            return credentials
        fallback_credentials = self.fallback.load()
        if fallback_credentials is not None:
            self._active = self.fallback
        return fallback_credentials

    def save(self, credentials: OAuthCredentials) -> None:
        try:
            self.primary.save(credentials)
        except CredentialStorageError:
            self._active = self.fallback
            self.fallback.save(credentials)
            return
        self._active = self.primary
        self.fallback.clear()

    def clear(self) -> None:
        errors: list[CredentialStorageError] = []
        for store in (self.primary, self.fallback):
            try:
                store.clear()
            except CredentialStorageError as error:
                errors.append(error)
        if len(errors) == 2:
            raise errors[0]


def create_credential_store(kind: str, data_dir: Path) -> CredentialStore:
    file_store = FileCredentialStore(data_dir / "donationalerts-credentials.json")
    if kind == "file":
        return file_store
    if kind == "keyring":
        return SystemKeyringCredentialStore()
    return AutomaticCredentialStore(file_store)
