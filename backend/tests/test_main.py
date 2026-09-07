from pathlib import Path

import pytest

from gambalator_backend.__main__ import (
    donation_alerts_startup_message,
    reserve_listening_sockets,
)
from gambalator_backend.config import Settings


class FakeOAuthManager:
    def __init__(
        self,
        *,
        configured: bool,
        connected: bool,
        reauthorization_required: bool = False,
    ):
        self.configured = configured
        self.connected = connected
        self.reauthorization_required = reauthorization_required

    def status(self) -> dict[str, object]:
        return {
            "applicationConfigured": self.configured,
            "connected": self.connected,
            "reauthorizationRequired": self.reauthorization_required,
        }


def settings(access_token: str | None = None) -> Settings:
    return Settings(
        data_dir=Path("unused-data"),
        frontend_dir=Path("unused-frontend"),
        access_token=access_token,
    )


def test_startup_message_recognizes_saved_oauth_credentials():
    message = donation_alerts_startup_message(
        settings(),
        FakeOAuthManager(configured=True, connected=True),
    )

    assert message == "DonationAlerts is connected using saved OAuth credentials."


def test_startup_message_reports_incomplete_authorization():
    message = donation_alerts_startup_message(
        settings(),
        FakeOAuthManager(configured=True, connected=False),
    )

    assert "authorization is incomplete" in message


def test_startup_message_reports_required_reauthorization():
    message = donation_alerts_startup_message(
        settings(),
        FakeOAuthManager(
            configured=True,
            connected=False,
            reauthorization_required=True,
        ),
    )

    assert "requires authorization again" in message


def test_reserved_port_rejects_a_second_listener():
    listeners = reserve_listening_sockets("127.0.0.1", 0)
    port = listeners[0].getsockname()[1]

    try:
        with pytest.raises(OSError):
            reserve_listening_sockets("127.0.0.1", port)
    finally:
        for listener in listeners:
            listener.close()
