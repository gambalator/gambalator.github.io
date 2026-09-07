from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template_string, request, send_from_directory

from .config import Settings
from .credentials import CredentialStorageError, CredentialStore, create_credential_store
from .database import Database
from .donationalerts import DonationAlertsClient, DonationAlertsError
from .exchange_rates import CbrExchangeRateClient, ExchangeRateError, ExchangeRateSource
from .oauth import OAuthManager, StaticAccessTokenProvider
from .sync import (
    AUTO_CHAT_STATE_KEY,
    BASELINE_INITIALIZED_KEY,
    LAST_SEEN_ID_KEY,
    LAST_SUCCESS_AT_KEY,
    SyncService,
    utc_now,
)


def _parse_since(payload: object) -> str:
    if not isinstance(payload, dict):
        raise ValueError("JSON request body is required")
    value = payload.get("since")
    if not isinstance(value, str) or not value.strip():
        raise ValueError("since is required")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as error:
        raise ValueError("since must be an ISO 8601 date and time") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("since must include a timezone")
    return parsed.astimezone(UTC).isoformat()


def _parse_reimport_request(payload: object) -> tuple[str, set[str]]:
    since = _parse_since(payload)
    assert isinstance(payload, dict)
    exclude_value = payload.get("excludeSourceIds", [])
    if not isinstance(exclude_value, list) or not all(
        isinstance(source_id, str) and source_id.strip()
        for source_id in exclude_value
    ):
        raise ValueError("excludeSourceIds must be an array of non-empty strings")
    return since, {source_id.strip() for source_id in exclude_value}


def _build_oauth_manager(settings: Settings, store: CredentialStore) -> OAuthManager:
    return OAuthManager(
        store,
        oauth_base_url=settings.oauth_base_url,
        redirect_uri=settings.oauth_redirect_uri,
        request_timeout_seconds=settings.request_timeout_seconds,
    )


def _build_source(settings: Settings, oauth_manager: OAuthManager):
    if settings.access_token:
        provider = StaticAccessTokenProvider(settings.access_token)
    elif oauth_manager.status()["connected"]:
        provider = oauth_manager
    else:
        return None
    return DonationAlertsClient(
        provider,
        api_base_url=settings.api_base_url,
        timeout_seconds=settings.request_timeout_seconds,
    )


def _build_service(
    settings: Settings,
    database: Database,
    oauth_manager: OAuthManager,
) -> SyncService:
    return SyncService(
        database,
        _build_source(settings, oauth_manager),
        poll_interval_seconds=settings.poll_interval_seconds,
        import_existing=settings.import_existing,
        max_pages_per_sync=settings.max_pages_per_sync,
    )


def create_app(
    settings: Settings,
    *,
    database: Database | None = None,
    sync_service: SyncService | None = None,
    credential_store: CredentialStore | None = None,
    oauth_manager: OAuthManager | None = None,
    exchange_rate_source: ExchangeRateSource | None = None,
) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.json.sort_keys = False

    database = database or Database(settings.database_path)
    database.initialize()
    credential_store = credential_store or create_credential_store(
        settings.credential_store, settings.data_dir
    )
    oauth_manager = oauth_manager or _build_oauth_manager(settings, credential_store)
    sync_service = sync_service or _build_service(settings, database, oauth_manager)
    exchange_rate_source = exchange_rate_source or CbrExchangeRateClient(
        timeout_seconds=min(settings.request_timeout_seconds, 5.0)
    )
    app.extensions["gambalator.database"] = database
    app.extensions["gambalator.sync_service"] = sync_service
    app.extensions["gambalator.oauth_manager"] = oauth_manager
    app.extensions["gambalator.exchange_rate_source"] = exchange_rate_source

    @app.after_request
    def prevent_api_caching(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "gambalator-backend"})

    @app.get("/api/exchange-rates")
    def exchange_rates():
        try:
            snapshot = exchange_rate_source.fetch_latest()
        except ExchangeRateError as error:
            return jsonify({"error": str(error)}), 502
        return jsonify(snapshot.to_public_dict())

    @app.get("/api/integration/status")
    def integration_status():
        status = sync_service.status.snapshot()
        try:
            oauth_status = oauth_manager.status()
            credential_error = None
        except CredentialStorageError as error:
            oauth_status = {
                "applicationConfigured": False,
                "apiKeyStored": False,
                "connected": False,
                "reauthorizationRequired": False,
                "clientId": None,
                "redirectUri": settings.oauth_redirect_uri,
                "credentialStorage": credential_store.storage_name,
                "secureCredentialStorage": credential_store.secure,
            }
            credential_error = str(error)
        using_environment_token = settings.access_token is not None
        status.update(
            {
                "configured": using_environment_token
                or oauth_status["applicationConfigured"],
                "connected": using_environment_token or oauth_status["connected"],
                "credentialSource": "environment"
                if using_environment_token
                else "oauth",
                "oauth": oauth_status,
                "credentialError": credential_error,
                "lastSeenId": database.get_state(LAST_SEEN_ID_KEY),
                "baselineInitialized": database.get_state(BASELINE_INITIALIZED_KEY) == "1",
                "lastPersistedSuccessAt": database.get_state(LAST_SUCCESS_AT_KEY),
                "pendingDonations": database.count_by_status("pending"),
                "acknowledgedDonations": database.count_by_status("acknowledged"),
                "autoChatEnabled": database.get_boolean_state(AUTO_CHAT_STATE_KEY),
            }
        )
        return jsonify(status)

    @app.get("/api/settings/auto-chat")
    def get_auto_chat():
        return jsonify(
            {"enabled": database.get_boolean_state(AUTO_CHAT_STATE_KEY)}
        )

    @app.put("/api/settings/auto-chat")
    def set_auto_chat():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get("enabled"), bool):
            return jsonify({"error": "enabled must be a boolean"}), 400
        enabled = payload["enabled"]
        database.set_boolean_state(AUTO_CHAT_STATE_KEY, enabled)
        return jsonify({"enabled": enabled})

    @app.post("/api/settings/auto-chat/toggle")
    def toggle_auto_chat():
        enabled = database.toggle_boolean_state(AUTO_CHAT_STATE_KEY)
        return jsonify({"enabled": enabled})

    @app.post("/api/integration/oauth/configure")
    def configure_oauth():
        if settings.access_token is not None:
            return jsonify(
                {"error": "Remove GAMBALATOR_DA_ACCESS_TOKEN before configuring OAuth"}
            ), 409
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "JSON request body is required"}), 400
        try:
            oauth_manager.configure(
                str(payload.get("clientId", "")),
                str(payload.get("clientSecret", "")),
            )
        except (DonationAlertsError, CredentialStorageError) as error:
            return jsonify({"error": str(error)}), 400
        return jsonify(oauth_manager.status())

    @app.post("/api/integration/oauth/start")
    def start_oauth():
        if settings.access_token is not None:
            return jsonify({"error": "OAuth is disabled by the environment token"}), 409
        try:
            authorization_url = oauth_manager.authorization_url()
        except (DonationAlertsError, CredentialStorageError) as error:
            return jsonify({"error": str(error)}), 400
        return jsonify({"authorizationUrl": authorization_url})

    @app.get("/api/oauth/callback")
    def oauth_callback():
        authorization_error = request.args.get("error")
        code = request.args.get("code", "").strip()
        state = request.args.get("state", "").strip()
        if authorization_error:
            return _oauth_error_page("Авторизация DonationAlerts была отменена."), 400
        if not code or not state:
            return _oauth_error_page("DonationAlerts не вернул код авторизации."), 400
        try:
            oauth_manager.exchange_code(code, state)
            sync_service.set_source(_build_source(settings, oauth_manager))
            sync_service.start()
        except (DonationAlertsError, CredentialStorageError) as error:
            return _oauth_error_page(str(error)), 502
        return redirect("/?donationalerts=connected")

    @app.post("/api/integration/disconnect")
    def disconnect_oauth():
        if settings.access_token is not None:
            return jsonify(
                {"error": "Remove GAMBALATOR_DA_ACCESS_TOKEN to disconnect"}
            ), 409
        try:
            sync_service.stop()
            oauth_manager.disconnect()
            sync_service.set_source(None)
        except CredentialStorageError as error:
            return jsonify({"error": str(error)}), 500
        return "", 204

    @app.get("/api/donations/pending")
    def pending_donations():
        try:
            limit = int(request.args.get("limit", "100"))
        except ValueError:
            return jsonify({"error": "limit must be an integer"}), 400
        if not 1 <= limit <= 500:
            return jsonify({"error": "limit must be between 1 and 500"}), 400

        donations = [item.to_public_dict() for item in database.list_pending(limit)]
        return jsonify({"data": donations, "count": len(donations)})

    @app.post("/api/donations/<string:source_id>/acknowledge")
    def acknowledge_donation(source_id: str):
        if not database.acknowledge(source_id, utc_now()):
            return jsonify({"error": "pending donation not found"}), 404
        return "", 204

    @app.post("/api/donations/reimport/preview")
    def preview_reimport():
        try:
            since, exclude_source_ids = _parse_reimport_request(
                request.get_json(silent=True)
            )
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        return jsonify(
            {
                "since": since,
                "count": database.count_reimportable_since(
                    since,
                    exclude_source_ids,
                ),
            }
        )

    @app.post("/api/donations/reimport")
    def reimport_donations():
        try:
            since, exclude_source_ids = _parse_reimport_request(
                request.get_json(silent=True)
            )
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        return jsonify(
            {
                "since": since,
                "requeued": database.requeue_acknowledged_since(
                    since,
                    exclude_source_ids,
                ),
            }
        )

    @app.post("/api/integration/sync")
    def synchronize_now():
        try:
            result = sync_service.sync_once()
        except DonationAlertsError as error:
            status_code = 503 if sync_service.source is None else 502
            return jsonify({"error": str(error)}), status_code
        return jsonify(
            {
                "baselineCreated": result.baseline_created,
                "fetched": result.fetched,
                "inserted": result.inserted,
                "newestId": result.newest_id,
            }
        )

    frontend_dir = settings.frontend_dir

    @app.get("/")
    def frontend_index():
        if (frontend_dir / "index.html").is_file():
            return send_from_directory(frontend_dir, "index.html")
        return jsonify(
            {
                "service": "gambalator-backend",
                "message": "Frontend build not found. Run `mise run build`.",
            }
        )

    @app.get("/<path:asset_path>")
    def frontend_asset(asset_path: str):
        if asset_path.startswith("api/"):
            return jsonify({"error": "not found"}), 404
        candidate = _safe_frontend_file(frontend_dir, asset_path)
        if candidate is not None and candidate.is_file():
            return send_from_directory(frontend_dir, asset_path)
        if (frontend_dir / "index.html").is_file():
            return send_from_directory(frontend_dir, "index.html")
        return jsonify({"error": "frontend build not found"}), 404

    return app


def _safe_frontend_file(frontend_dir: Path, asset_path: str) -> Path | None:
    root = frontend_dir.resolve()
    candidate = (root / asset_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _oauth_error_page(message: str):
    return render_template_string(
        """
        <!doctype html>
        <html lang="ru">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Gambalator — DonationAlerts</title>
            <style>
              body { background: #111018; color: #f8eefa; font: 18px system-ui;
                     display: grid; min-height: 100vh; place-items: center; margin: 0; }
              main { background: #211c2b; border: 1px solid #fa75db; border-radius: 18px;
                     max-width: 620px; padding: 30px; }
              a { color: #fa75db; }
            </style>
          </head>
          <body><main><h1>Не удалось подключить DonationAlerts</h1>
          <p>{{ message }}</p><a href="/">Вернуться в Gambalator</a></main></body>
        </html>
        """,
        message=message,
    )
