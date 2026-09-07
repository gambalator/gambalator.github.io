from __future__ import annotations

import argparse
import os
import socket
from typing import Protocol

from waitress import create_server

from .app import create_app
from .config import Settings, load_local_environment
from .credentials import CredentialStorageError


class OAuthStatusProvider(Protocol):
    def status(self) -> dict[str, object]: ...


def reserve_listening_sockets(host: str, port: int) -> list[socket.socket]:
    """Bind sockets before background work starts and prevent shared Windows ports."""
    address_info = socket.getaddrinfo(
        host,
        port,
        family=socket.AF_UNSPEC,
        type=socket.SOCK_STREAM,
        flags=socket.AI_PASSIVE,
    )
    listeners: list[socket.socket] = []
    seen_addresses: set[tuple[int, tuple[object, ...]]] = set()

    try:
        for family, socket_type, protocol, _, address in address_info:
            if family not in {socket.AF_INET, socket.AF_INET6}:
                continue

            address_key = (family, address)
            if address_key in seen_addresses:
                continue
            seen_addresses.add(address_key)

            listener = socket.socket(family, socket_type, protocol)
            try:
                if os.name == "nt":
                    listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                else:
                    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                if family == socket.AF_INET6:
                    listener.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                listener.bind(address)
                listener.listen(socket.SOMAXCONN)
            except OSError:
                listener.close()
                raise
            listeners.append(listener)
    except OSError:
        for listener in listeners:
            listener.close()
        raise

    if not listeners:
        raise OSError(f"No TCP addresses resolved for {host}:{port}")
    return listeners


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

    try:
        listeners = reserve_listening_sockets(settings.host, settings.port)
    except OSError as error:
        print(
            f"Gambalator is already running, or port {settings.port} is occupied."
        )
        raise SystemExit(1) from error

    server = None
    sync_service = None
    sync_started = False
    try:
        app = create_app(settings)
        sync_service = app.extensions["gambalator.sync_service"]
        oauth_manager = app.extensions["gambalator.oauth_manager"]
        server = create_server(app, sockets=listeners, threads=4)
        listeners = []  # Waitress owns the reserved sockets now.

        if not args.no_poller:
            sync_service.start()
            sync_started = True

        print(f"Gambalator is available at http://{settings.host}:{settings.port}")
        print(donation_alerts_startup_message(settings, oauth_manager))
        server.run()
    finally:
        if sync_started and sync_service is not None:
            sync_service.stop()
        if server is not None:
            server.close()
        for listener in listeners:
            listener.close()


if __name__ == "__main__":
    main()
