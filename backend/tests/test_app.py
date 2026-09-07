from pathlib import Path
from urllib.parse import parse_qs, urlparse

from gambalator_backend.app import create_app
from gambalator_backend.config import Settings
from gambalator_backend.database import Database, Donation
from gambalator_backend.exchange_rates import ExchangeRateError, ExchangeRateSnapshot
from gambalator_backend.sync import SyncService


def build_app(tmp_path: Path, *, exchange_rate_source=None):
    settings = Settings(
        data_dir=tmp_path,
        frontend_dir=tmp_path / "missing-dist",
        access_token=None,
        credential_store="file",
    )
    database = Database(settings.database_path)
    database.initialize()
    sync = SyncService(
        database,
        None,
        poll_interval_seconds=5,
        import_existing=False,
        max_pages_per_sync=10,
    )
    return (
        create_app(
            settings,
            database=database,
            sync_service=sync,
            exchange_rate_source=exchange_rate_source,
        ),
        database,
    )


class ExchangeRateSourceStub:
    def __init__(self, *, error: ExchangeRateError | None = None):
        self.error = error

    def fetch_latest(self):
        if self.error is not None:
            raise self.error
        return ExchangeRateSnapshot(
            effective_date="2026-09-08",
            rates_tenths={
                "EUR": 923,
                "USD": 785,
                "BYN": 271,
                "KZT": 157,
                "UAH": 175,
                "BRL": 155,
                "TRY": 180,
                "PLN": 232,
                "UZS": 731,
            },
        )


def test_health_and_disconnected_status(tmp_path):
    app, _database = build_app(tmp_path)
    client = app.test_client()

    assert client.get("/api/health").get_json() == {
        "status": "ok",
        "service": "gambalator-backend",
    }
    status = client.get("/api/integration/status").get_json()
    assert status["configured"] is False
    assert status["pendingDonations"] == 0
    assert status["autoChatEnabled"] is False
    assert status["oauth"]["apiKeyStored"] is False
    assert status["oauth"]["reauthorizationRequired"] is False


def test_exchange_rates_are_returned_in_the_frontend_contract(tmp_path):
    app, _database = build_app(
        tmp_path,
        exchange_rate_source=ExchangeRateSourceStub(),
    )

    response = app.test_client().get("/api/exchange-rates")

    assert response.status_code == 200
    assert response.get_json() == {
        "source": "Банк России",
        "sourceUrl": "https://www.cbr.ru/scripts/XML_daily.asp",
        "effectiveDate": "2026-09-08",
        "rates": [
            {"currency": "EUR", "units": 1, "rubTenths": 923},
            {"currency": "USD", "units": 1, "rubTenths": 785},
            {"currency": "BYN", "units": 1, "rubTenths": 271},
            {"currency": "KZT", "units": 100, "rubTenths": 157},
            {"currency": "UAH", "units": 10, "rubTenths": 175},
            {"currency": "BRL", "units": 1, "rubTenths": 155},
            {"currency": "TRY", "units": 10, "rubTenths": 180},
            {"currency": "PLN", "units": 1, "rubTenths": 232},
            {"currency": "UZS", "units": 10_000, "rubTenths": 731},
        ],
    }


def test_exchange_rate_provider_failure_returns_bad_gateway(tmp_path):
    app, _database = build_app(
        tmp_path,
        exchange_rate_source=ExchangeRateSourceStub(
            error=ExchangeRateError("provider unavailable")
        ),
    )

    response = app.test_client().get("/api/exchange-rates")

    assert response.status_code == 502
    assert response.get_json() == {"error": "provider unavailable"}


def test_auto_chat_can_be_read_set_and_toggled(tmp_path):
    app, _database = build_app(tmp_path)
    client = app.test_client()

    assert client.get("/api/settings/auto-chat").get_json() == {"enabled": False}

    enabled = client.put("/api/settings/auto-chat", json={"enabled": True})
    assert enabled.status_code == 200
    assert enabled.get_json() == {"enabled": True}
    assert client.get("/api/integration/status").get_json()["autoChatEnabled"] is True

    toggled = client.post("/api/settings/auto-chat/toggle")
    assert toggled.status_code == 200
    assert toggled.get_json() == {"enabled": False}
    assert client.get("/api/settings/auto-chat").get_json() == {"enabled": False}

    invalid = client.put("/api/settings/auto-chat", json={"enabled": "yes"})
    assert invalid.status_code == 400


def test_pending_donations_can_be_acknowledged(tmp_path):
    app, database = build_app(tmp_path)
    database.insert_donations(
        [
            Donation(
                source_id="99",
                username="Chel_9",
                amount_tenths=855,
                original_amount="1.0",
                currency="USD",
                donated_at=None,
                fetched_at="2026-09-06T12:00:00+00:00",
            )
        ]
    )
    client = app.test_client()

    response = client.get("/api/donations/pending")
    assert response.status_code == 200
    assert response.get_json()["data"][0]["username"] == "Chel_9"
    assert response.get_json()["data"][0]["isChat"] is False
    assert response.get_json()["data"][0]["supportedCurrency"] is True

    assert client.post("/api/donations/99/acknowledge").status_code == 204
    assert client.get("/api/donations/pending").get_json()["data"] == []
    assert client.post("/api/donations/99/acknowledge").status_code == 404


def test_manual_sync_requires_configuration(tmp_path):
    app, _database = build_app(tmp_path)
    response = app.test_client().post("/api/integration/sync")

    assert response.status_code == 503
    assert "not configured" in response.get_json()["error"]


def test_oauth_application_can_be_configured_without_exposing_secret(tmp_path):
    app, _database = build_app(tmp_path)
    client = app.test_client()

    configured = client.post(
        "/api/integration/oauth/configure",
        json={"clientId": "123", "clientSecret": "very-secret"},
    )
    assert configured.status_code == 200
    assert configured.get_json()["clientId"] == "123"
    assert configured.get_json()["apiKeyStored"] is True
    assert "very-secret" not in configured.get_data(as_text=True)

    started = client.post("/api/integration/oauth/start")
    assert started.status_code == 200
    query = parse_qs(urlparse(started.get_json()["authorizationUrl"]).query)
    assert query["client_id"] == ["123"]
    assert query["scope"] == ["oauth-donation-index"]


def test_pending_limit_is_validated(tmp_path):
    app, _database = build_app(tmp_path)
    client = app.test_client()

    assert client.get("/api/donations/pending?limit=nope").status_code == 400
    assert client.get("/api/donations/pending?limit=501").status_code == 400


def test_acknowledged_donations_can_be_previewed_and_reimported(tmp_path):
    app, database = build_app(tmp_path)
    database.insert_donations(
        [
            Donation(
                source_id="100",
                username="Chel_1",
                amount_tenths=1_000,
                original_amount="100.0",
                currency="RUB",
                donated_at="2026-09-06 10:00:00",
                fetched_at="2026-09-06T10:00:01+00:00",
            ),
            Donation(
                source_id="101",
                username="Chel_2",
                amount_tenths=2_000,
                original_amount="200.0",
                currency="RUB",
                donated_at="2026-09-06 11:00:00",
                fetched_at="2026-09-06T11:00:01+00:00",
            ),
        ]
    )
    database.acknowledge("100", "2026-09-06T12:00:00+00:00")
    database.acknowledge("101", "2026-09-06T12:00:00+00:00")
    client = app.test_client()
    body = {"since": "2026-09-06T10:30:00+00:00"}

    preview = client.post("/api/donations/reimport/preview", json=body)
    assert preview.status_code == 200
    assert preview.get_json()["count"] == 1
    assert database.list_pending(10) == []

    excluded = client.post(
        "/api/donations/reimport/preview",
        json={**body, "excludeSourceIds": ["101"]},
    )
    assert excluded.status_code == 200
    assert excluded.get_json()["count"] == 0

    reimported = client.post("/api/donations/reimport", json=body)
    assert reimported.status_code == 200
    assert reimported.get_json()["requeued"] == 1
    assert [item.source_id for item in database.list_pending(10)] == ["101"]


def test_reimport_requires_a_timezone_aware_timestamp(tmp_path):
    app, _database = build_app(tmp_path)
    client = app.test_client()

    assert client.post("/api/donations/reimport/preview", json={}).status_code == 400
    response = client.post(
        "/api/donations/reimport/preview",
        json={"since": "2026-09-06T10:00"},
    )
    assert response.status_code == 400
    assert "timezone" in response.get_json()["error"]

    invalid_exclusions = client.post(
        "/api/donations/reimport/preview",
        json={
            "since": "2026-09-06T10:00:00+00:00",
            "excludeSourceIds": "101",
        },
    )
    assert invalid_exclusions.status_code == 400
    assert "excludeSourceIds" in invalid_exclusions.get_json()["error"]
