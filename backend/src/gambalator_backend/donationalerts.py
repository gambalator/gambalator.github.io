from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import requests


class DonationAlertsError(RuntimeError):
    """Raised when DonationAlerts cannot return a valid donation page."""


@dataclass(frozen=True, slots=True)
class DonationPage:
    items: list[dict[str, Any]]
    current_page: int
    last_page: int


class DonationSource(Protocol):
    def fetch_page(self, page: int) -> DonationPage: ...


class AccessTokenProvider(Protocol):
    def get_access_token(self, *, force_refresh: bool = False) -> str: ...


class DonationAlertsClient:
    def __init__(
        self,
        token_provider: AccessTokenProvider,
        *,
        api_base_url: str,
        timeout_seconds: float,
        session: requests.Session | None = None,
    ):
        self.api_base_url = api_base_url.rstrip("/")
        self.token_provider = token_provider
        self.timeout_seconds = timeout_seconds
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/json",
                "User-Agent": "Gambalator/0.1 local-backend",
            }
        )

    def fetch_page(self, page: int) -> DonationPage:
        response = None
        for attempt in range(2):
            try:
                access_token = self.token_provider.get_access_token(
                    force_refresh=attempt == 1
                )
                response = self.session.get(
                    f"{self.api_base_url}/alerts/donations",
                    params={"page": page},
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=self.timeout_seconds,
                )
                if response.status_code == 401 and attempt == 0:
                    continue
                response.raise_for_status()
                payload = response.json()
                break
            except (requests.RequestException, ValueError) as error:
                raise DonationAlertsError(f"DonationAlerts request failed: {error}") from error
        else:
            raise DonationAlertsError("DonationAlerts rejected the access token")

        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise DonationAlertsError("DonationAlerts returned an unexpected response")

        meta = payload.get("meta")
        if not isinstance(meta, dict):
            raise DonationAlertsError("DonationAlerts response does not contain pagination")

        try:
            current_page = int(meta["current_page"])
            last_page = int(meta["last_page"])
        except (KeyError, TypeError, ValueError) as error:
            raise DonationAlertsError("DonationAlerts returned invalid pagination") from error

        if current_page < 1 or last_page < current_page:
            raise DonationAlertsError("DonationAlerts returned invalid page numbers")

        items = payload["data"]
        if not all(isinstance(item, dict) for item in items):
            raise DonationAlertsError("DonationAlerts returned an invalid donation resource")

        return DonationPage(items=items, current_page=current_page, last_page=last_page)
