from __future__ import annotations

import secrets
import threading
import time
from dataclasses import replace
from typing import Any
from urllib.parse import urlencode

import requests

from .credentials import CredentialStore, OAuthCredentials
from .donationalerts import DonationAlertsError

OAUTH_SCOPE = "oauth-donation-index"
STATE_LIFETIME_SECONDS = 10 * 60


class OAuthReauthorizationRequired(DonationAlertsError):
    """Raised when saved OAuth tokens can no longer refresh authorization."""


class OAuthManager:
    def __init__(
        self,
        store: CredentialStore,
        *,
        oauth_base_url: str,
        redirect_uri: str,
        request_timeout_seconds: float,
        session: requests.Session | None = None,
        clock=time.time,
    ):
        self.store = store
        self.oauth_base_url = oauth_base_url.rstrip("/")
        self.redirect_uri = redirect_uri
        self.request_timeout_seconds = request_timeout_seconds
        self.session = session or requests.Session()
        self.clock = clock
        self._lock = threading.Lock()
        self._pending_state: str | None = None
        self._pending_state_created_at: float | None = None
        self._reauthorization_required = False

    def status(self) -> dict[str, object]:
        credentials = self.store.load()
        reauthorization_required = credentials is not None and self._reauthorization_required
        return {
            "applicationConfigured": credentials is not None,
            "apiKeyStored": bool(credentials and credentials.client_secret),
            "connected": bool(
                credentials
                and (credentials.access_token is not None or credentials.refresh_token is not None)
                and not reauthorization_required
            ),
            "reauthorizationRequired": reauthorization_required,
            "clientId": None if credentials is None else credentials.client_id,
            "redirectUri": self.redirect_uri,
            "credentialStorage": self.store.storage_name,
            "secureCredentialStorage": self.store.secure,
        }

    def configure(self, client_id: str, client_secret: str) -> None:
        normalized_id = client_id.strip()
        normalized_secret = client_secret.strip()
        if not normalized_id.isdigit():
            raise DonationAlertsError("DonationAlerts App ID must be a number")
        if not normalized_secret:
            raise DonationAlertsError("DonationAlerts API Key is required")

        current = self.store.load()
        preserve_tokens = current is not None and current.client_id == normalized_id
        self._reauthorization_required = False
        self.store.save(
            OAuthCredentials(
                client_id=normalized_id,
                client_secret=normalized_secret,
                access_token=current.access_token if preserve_tokens else None,
                refresh_token=current.refresh_token if preserve_tokens else None,
                expires_at=current.expires_at if preserve_tokens else None,
            )
        )

    def authorization_url(self) -> str:
        credentials = self._required_credentials()
        with self._lock:
            self._pending_state = secrets.token_urlsafe(32)
            self._pending_state_created_at = self.clock()
            state = self._pending_state

        query = urlencode(
            {
                "client_id": credentials.client_id,
                "redirect_uri": self.redirect_uri,
                "response_type": "code",
                "scope": OAUTH_SCOPE,
                "state": state,
            }
        )
        return f"{self.oauth_base_url}/oauth/authorize?{query}"

    def exchange_code(self, code: str, state: str) -> None:
        self._validate_state(state)
        credentials = self._required_credentials()
        token_payload = self._token_request(
            {
                "grant_type": "authorization_code",
                "client_id": credentials.client_id,
                "client_secret": credentials.client_secret,
                "redirect_uri": self.redirect_uri,
                "code": code,
            }
        )
        self._save_token_response(credentials, token_payload)

    def get_access_token(self, *, force_refresh: bool = False) -> str:
        with self._lock:
            credentials = self._required_credentials()
            if self._reauthorization_required:
                raise OAuthReauthorizationRequired(
                    "DonationAlerts requires authorization again"
                )
            token_is_fresh = (
                credentials.access_token is not None
                and (
                    credentials.expires_at is None
                    or credentials.expires_at > self.clock() + 30
                )
            )
            if token_is_fresh and not force_refresh:
                return credentials.access_token
            if credentials.refresh_token is None:
                self._reauthorization_required = True
                raise OAuthReauthorizationRequired(
                    "DonationAlerts requires authorization again"
                )

            try:
                token_payload = self._token_request(
                    {
                        "grant_type": "refresh_token",
                        "refresh_token": credentials.refresh_token,
                        "client_id": credentials.client_id,
                        "client_secret": credentials.client_secret,
                        "scope": OAUTH_SCOPE,
                    }
                )
            except OAuthReauthorizationRequired:
                self._reauthorization_required = True
                raise
            updated = self._save_token_response(credentials, token_payload)
            if updated.access_token is None:
                raise DonationAlertsError("DonationAlerts did not return an access token")
            return updated.access_token

    def disconnect(self) -> None:
        credentials = self.store.load()
        self._reauthorization_required = False
        if credentials is None:
            return
        self.store.save(
            replace(
                credentials,
                access_token=None,
                refresh_token=None,
                expires_at=None,
            )
        )

    def _required_credentials(self) -> OAuthCredentials:
        credentials = self.store.load()
        if credentials is None:
            raise DonationAlertsError("DonationAlerts application is not configured")
        return credentials

    def _validate_state(self, received_state: str) -> None:
        with self._lock:
            expected = self._pending_state
            created_at = self._pending_state_created_at
            self._pending_state = None
            self._pending_state_created_at = None

        if (
            expected is None
            or created_at is None
            or self.clock() - created_at > STATE_LIFETIME_SECONDS
            or not secrets.compare_digest(expected, received_state)
        ):
            raise DonationAlertsError("DonationAlerts authorization session is invalid or expired")

    def _token_request(self, form: dict[str, str]) -> dict[str, Any]:
        try:
            response = self.session.post(
                f"{self.oauth_base_url}/oauth/token",
                data=form,
                headers={"Accept": "application/json"},
                timeout=self.request_timeout_seconds,
            )
            if (
                form.get("grant_type") == "refresh_token"
                and response.status_code in {400, 401}
            ):
                raise OAuthReauthorizationRequired(
                    "DonationAlerts refresh token was rejected; authorization is required again"
                )
            response.raise_for_status()
            payload = response.json()
        except OAuthReauthorizationRequired:
            raise
        except (requests.RequestException, ValueError) as error:
            raise DonationAlertsError(f"DonationAlerts authorization failed: {error}") from error
        if not isinstance(payload, dict):
            raise DonationAlertsError("DonationAlerts returned an invalid token response")
        return payload

    def _save_token_response(
        self,
        credentials: OAuthCredentials,
        payload: dict[str, Any],
    ) -> OAuthCredentials:
        access_token = str(payload.get("access_token", "")).strip()
        if not access_token:
            raise DonationAlertsError("DonationAlerts did not return an access token")
        refresh_value = payload.get("refresh_token")
        refresh_token = (
            str(refresh_value).strip() if refresh_value else credentials.refresh_token
        )
        try:
            expires_in = float(payload["expires_in"])
        except (KeyError, TypeError, ValueError) as error:
            raise DonationAlertsError(
                "DonationAlerts returned an invalid token lifetime"
            ) from error
        if expires_in <= 0:
            raise DonationAlertsError("DonationAlerts returned an invalid token lifetime")

        updated = replace(
            credentials,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=self.clock() + expires_in,
        )
        self.store.save(updated)
        self._reauthorization_required = False
        return updated


class StaticAccessTokenProvider:
    def __init__(self, access_token: str):
        self.access_token = access_token

    def get_access_token(self, *, force_refresh: bool = False) -> str:
        if force_refresh:
            raise DonationAlertsError(
                "The access token from GAMBALATOR_DA_ACCESS_TOKEN was rejected"
            )
        return self.access_token
