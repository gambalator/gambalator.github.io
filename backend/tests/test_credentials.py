from dataclasses import replace

import pytest
from keyring.errors import KeyringError, PasswordDeleteError

from gambalator_backend.credentials import (
    AutomaticCredentialStore,
    CredentialStorageError,
    FileCredentialStore,
    OAuthCredentials,
    SystemKeyringCredentialStore,
)


class NativeWindowsError(Exception):
    """Like pywintypes.error, this does not inherit from OSError or KeyringError."""


@pytest.mark.parametrize("error_type", [KeyringError, OSError, NativeWindowsError])
@pytest.mark.parametrize(
    ("operation", "keyring_operation"),
    [("load", "get_password"), ("save", "set_password"), ("clear", "delete_password")],
)
def test_keyring_errors_are_normalized(monkeypatch, error_type, operation, keyring_operation):
    def fail(*args):
        raise error_type("credential backend failed")

    monkeypatch.setattr(f"gambalator_backend.credentials.keyring.{keyring_operation}", fail)
    store = SystemKeyringCredentialStore()
    with pytest.raises(CredentialStorageError):
        if operation == "save":
            store.save(OAuthCredentials("123", "test-secret"))
        else:
            getattr(store, operation)()


def test_token_save_fallback_survives_restart_and_stale_keyring(tmp_path, monkeypatch):
    configured = OAuthCredentials("123", "test-secret")
    connected = replace(configured, access_token="test-access", refresh_token="test-refresh")
    keyring_record = configured

    def get_password(*args):
        import json
        from dataclasses import asdict

        return json.dumps(asdict(keyring_record))

    def fail_write(*args):
        raise NativeWindowsError(1783, "CredWrite", "The stub received bad data.")

    monkeypatch.setattr("gambalator_backend.credentials.keyring.get_password", get_password)
    monkeypatch.setattr("gambalator_backend.credentials.keyring.set_password", fail_write)
    fallback = FileCredentialStore(tmp_path / "credentials.json")
    store = AutomaticCredentialStore(fallback)
    assert store.load() == configured
    store.save(connected)
    assert store.storage_name == "local-file"
    assert not store.secure
    assert store.load() == connected
    restarted = AutomaticCredentialStore(fallback)
    assert restarted.load() == connected
    assert not restarted.secure

    def successful_write(service, account, raw):
        nonlocal keyring_record
        import json

        keyring_record = OAuthCredentials(**json.loads(raw))

    monkeypatch.setattr("gambalator_backend.credentials.keyring.set_password", successful_write)
    refreshed = replace(connected, access_token="refreshed-access")
    restarted.save(refreshed)
    assert restarted.secure
    assert not fallback.path.exists()
    assert AutomaticCredentialStore(fallback).load() == refreshed


def test_clear_missing_keyring_password_is_harmless(monkeypatch):
    def missing(*args):
        raise PasswordDeleteError("missing")

    monkeypatch.setattr("gambalator_backend.credentials.keyring.delete_password", missing)
    SystemKeyringCredentialStore().clear()
