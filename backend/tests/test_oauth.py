from __future__ import annotations

from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
import requests

from gambalator_backend.credentials import CredentialStore, OAuthCredentials
from gambalator_backend.donationalerts import DonationAlertsError
from gambalator_backend.oauth import OAuthManager, OAuthReauthorizationRequired


class MemoryStore(CredentialStore):
    def __init__(self):
        self.credentials: OAuthCredentials | None = None

    @property
    def storage_name(self) -> str:
        return "memory"

    @property
    def secure(self) -> bool:
        return True

    def load(self) -> OAuthCredentials | None:
        return self.credentials

    def save(self, credentials: OAuthCredentials) -> None:
        self.credentials = credentials

    def clear(self) -> None:
        self.credentials = None


class FakeResponse:
    def __init__(self, payload: dict[str, Any], status_code: int = 200):
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def json(self) -> dict[str, Any]:
        return self.payload


class FakeSession:
    def __init__(self, responses: list[FakeResponse]):
        self.responses = responses
        self.forms: list[dict[str, str]] = []

    def post(self, _url: str, *, data: dict[str, str], **_kwargs: Any) -> FakeResponse:
        self.forms.append(data)
        return self.responses.pop(0)


def manager(
    store: MemoryStore,
    session: FakeSession,
    clock: Callable[[], float] = lambda: 1000,
) -> OAuthManager:
    return OAuthManager(
        store,
        oauth_base_url="https://www.donationalerts.com",
        redirect_uri="http://127.0.0.1:5741/api/oauth/callback",
        request_timeout_seconds=5,
        session=session,  # type: ignore[arg-type]
        clock=clock,
    )


def test_authorization_code_flow_stores_tokens_without_exposing_secret():
    store = MemoryStore()
    session = FakeSession(
        [
            FakeResponse(
                {
                    "access_token": "access-1",
                    "refresh_token": "refresh-1",
                    "expires_in": 3600,
                }
            )
        ]
    )
    oauth = manager(store, session)
    oauth.configure("123", "client-secret")

    authorization_url = oauth.authorization_url()
    query = parse_qs(urlparse(authorization_url).query)
    assert query["client_id"] == ["123"]
    assert query["scope"] == ["oauth-donation-index"]
    assert query["response_type"] == ["code"]

    oauth.exchange_code("temporary-code", query["state"][0])

    assert store.credentials is not None
    assert store.credentials.access_token == "access-1"
    assert store.credentials.refresh_token == "refresh-1"
    assert session.forms[0]["client_secret"] == "client-secret"
    assert "clientSecret" not in oauth.status()


def test_expired_access_token_is_refreshed_and_new_refresh_token_is_optional():
    now = [1000.0]
    store = MemoryStore()
    store.save(
        OAuthCredentials(
            client_id="123",
            client_secret="secret",
            access_token="expired",
            refresh_token="refresh-1",
            expires_at=999,
        )
    )
    session = FakeSession(
        [FakeResponse({"access_token": "access-2", "expires_in": 7200})]
    )
    oauth = manager(store, session, lambda: now[0])

    assert oauth.get_access_token() == "access-2"
    assert store.credentials is not None
    assert store.credentials.refresh_token == "refresh-1"
    assert session.forms[0]["grant_type"] == "refresh_token"
    assert oauth.status()["reauthorizationRequired"] is False


def test_rejected_refresh_token_requires_reauthorization_until_new_code_exchange():
    store = MemoryStore()
    store.save(
        OAuthCredentials(
            client_id="123",
            client_secret="secret",
            access_token="expired",
            refresh_token="refresh-1",
            expires_at=999,
        )
    )
    session = FakeSession(
        [
            FakeResponse({"error": "invalid_grant"}, status_code=400),
            FakeResponse(
                {
                    "access_token": "access-2",
                    "refresh_token": "refresh-2",
                    "expires_in": 3600,
                }
            ),
        ]
    )
    oauth = manager(store, session)

    with pytest.raises(OAuthReauthorizationRequired, match="authorization is required"):
        oauth.get_access_token()

    status = oauth.status()
    assert status["applicationConfigured"] is True
    assert status["apiKeyStored"] is True
    assert status["connected"] is False
    assert status["reauthorizationRequired"] is True

    with pytest.raises(OAuthReauthorizationRequired, match="authorization again"):
        oauth.get_access_token()
    assert len(session.forms) == 1

    authorization_url = oauth.authorization_url()
    state = parse_qs(urlparse(authorization_url).query)["state"][0]
    oauth.exchange_code("new-code", state)

    assert oauth.status()["connected"] is True
    assert oauth.status()["reauthorizationRequired"] is False
    assert store.credentials is not None
    assert store.credentials.access_token == "access-2"
    assert store.credentials.refresh_token == "refresh-2"


def test_temporary_refresh_failure_does_not_require_reauthorization():
    store = MemoryStore()
    store.save(
        OAuthCredentials(
            client_id="123",
            client_secret="secret",
            access_token="expired",
            refresh_token="refresh-1",
            expires_at=999,
        )
    )
    oauth = manager(
        store,
        FakeSession([FakeResponse({"error": "server_error"}, status_code=500)]),
    )

    with pytest.raises(DonationAlertsError, match="authorization failed"):
        oauth.get_access_token()

    assert oauth.status()["connected"] is True
    assert oauth.status()["reauthorizationRequired"] is False


def test_callback_rejects_wrong_or_reused_state():
    store = MemoryStore()
    oauth = manager(store, FakeSession([]))
    oauth.configure("123", "secret")
    authorization_url = oauth.authorization_url()
    state = parse_qs(urlparse(authorization_url).query)["state"][0]

    with pytest.raises(DonationAlertsError, match="invalid or expired"):
        oauth.exchange_code("code", "wrong-state")
    with pytest.raises(DonationAlertsError, match="invalid or expired"):
        oauth.exchange_code("code", state)
