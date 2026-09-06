from __future__ import annotations

import argparse
from typing import Protocol

from waitress import serve

from .app import create_app
from .config import Settings, load_local_environment
from .credentials import CredentialStorageError


class OAuthStatusProvider(Protocol):
    def status(self) -> dict[str, object]: ...


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local Gambalator service")
    parser.add_argument(
        "--no-poller",
        action="store_true",
        help="serve the local API without starting background DonationAlerts polling",
    )
    return parser.parse_args()


def donation_alerts_startup_message(
    settings: Settings,
    oauth_manager: OAuthStatusProvider,
) -> str:
    if settings.access_token is not None:
        return "DonationAlerts is connected using GAMBALATOR_DA_ACCESS_TOKEN."

    try:
        oauth_status = oauth_manager.status()
    except CredentialStorageError as error:
        return f"DonationAlerts credential status is unavailable: {error}"

    if oauth_status["connected"]:
        return "DonationAlerts is connected using saved OAuth credentials."
    if oauth_status.get("reauthorizationRequired"):
        return "DonationAlerts requires authorization again in the application."
    if oauth_status["applicationConfigured"]:
        return "DonationAlerts application is configured, but authorization is incomplete."
    return "DonationAlerts is not configured yet. Configure it in the application."


def main() -> None:
    args = parse_args()
    load_local_environment()
    settings = Settings.from_environment()
    app = create_app(settings)
    sync_service = app.extensions["gambalator.sync_service"]
    oauth_manager = app.extensions["gambalator.oauth_manager"]

    if not args.no_poller:
        sync_service.start()

    print(f"Gambalator is available at http://{settings.host}:{settings.port}")
    print(donation_alerts_startup_message(settings, oauth_manager))

    try:
        serve(app, host=settings.host, port=settings.port, threads=4)
    finally:
        sync_service.stop()


if __name__ == "__main__":
    main()
