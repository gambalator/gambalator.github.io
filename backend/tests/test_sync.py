from typing import Any

import pytest

from gambalator_backend.database import Database
from gambalator_backend.donationalerts import DonationAlertsError, DonationPage
from gambalator_backend.sync import (
    AUTO_CHAT_STATE_KEY,
    BASELINE_INITIALIZED_KEY,
    HISTORY_OLDEST_AT_KEY,
    LAST_SEEN_ID_KEY,
    SyncService,
    normalize_donation,
)


class FakeSource:
    def __init__(self, pages: dict[int, list[dict[str, Any]]]):
        self.pages = pages

    def fetch_page(self, page: int) -> DonationPage:
        return DonationPage(
            items=self.pages.get(page, []),
            current_page=page,
            last_page=max(self.pages),
        )


def raw(source_id: int, username: str = "Chel_1", **values: Any) -> dict[str, Any]:
    return {
        "id": source_id,
        "username": username,
        "amount": 100,
        "currency": "RUB",
        "created_at": "2026-09-06 12:00:00",
        **values,
    }


def service(database: Database, source: FakeSource, *, import_existing: bool = False):
    return SyncService(
        database,
        source,
        poll_interval_seconds=5,
        import_existing=import_existing,
        max_pages_per_sync=20,
        history_page_delay_seconds=0,
    )


def test_first_sync_creates_baseline_without_importing_history(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    sync = service(database, FakeSource({1: [raw(3), raw(2), raw(1)]}))

    result = sync.sync_once()

    assert result.baseline_created is True
    assert result.inserted == 0
    assert database.get_state(LAST_SEEN_ID_KEY) == "3"
    assert database.get_state(BASELINE_INITIALIZED_KEY) == "1"
    assert database.list_pending(100) == []


def test_first_donation_after_empty_baseline_is_not_lost(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    sync = service(database, FakeSource({1: []}))

    baseline = sync.sync_once()
    assert baseline.baseline_created is True
    assert database.get_state(LAST_SEEN_ID_KEY) is None

    sync.source = FakeSource({1: [raw(1)]})
    result = sync.sync_once()

    assert result.inserted == 1
    assert [item.source_id for item in database.list_pending(100)] == ["1"]


def test_later_sync_imports_missed_donations_in_chronological_order(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    database.set_state(LAST_SEEN_ID_KEY, "3")
    sync = service(database, FakeSource({1: [raw(5), raw(4), raw(3), raw(2)]}))

    result = sync.sync_once()

    assert result.inserted == 2
    assert database.get_state(LAST_SEEN_ID_KEY) == "5"
    assert [item.source_id for item in database.list_pending(100)] == ["4", "5"]


def test_new_donations_capture_auto_chat_state_when_received(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    database.set_state(LAST_SEEN_ID_KEY, "1")
    database.set_boolean_state(AUTO_CHAT_STATE_KEY, True)
    sync = service(database, FakeSource({1: [raw(2), raw(1)]}))

    assert sync.sync_once().inserted == 1
    first = database.list_pending(100)
    assert first[0].source_id == "2"
    assert first[0].is_chat is True
    assert first[0].to_public_dict()["isChat"] is True

    database.set_boolean_state(AUTO_CHAT_STATE_KEY, False)
    sync.source = FakeSource({1: [raw(3), raw(2)]})
    assert sync.sync_once().inserted == 1

    pending = database.list_pending(100)
    assert [(item.source_id, item.is_chat) for item in pending] == [
        ("2", True),
        ("3", False),
    ]


def test_sync_paginates_until_saved_id(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    database.set_state(LAST_SEEN_ID_KEY, "2")
    source = FakeSource({1: [raw(5), raw(4)], 2: [raw(3), raw(2)], 3: [raw(1)]})

    result = service(database, source).sync_once()

    assert result.inserted == 3
    assert [item.source_id for item in database.list_pending(100)] == ["3", "4", "5"]


def test_first_sync_can_import_existing_history(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    source = FakeSource({1: [raw(3), raw(2)], 2: [raw(1)]})

    result = service(database, source, import_existing=True).sync_once()

    assert result.baseline_created is False
    assert result.inserted == 3
    assert [item.source_id for item in database.list_pending(100)] == ["1", "2", "3"]


def test_normalization_uses_decimal_half_up_and_supports_da_output_currencies():
    item = normalize_donation(
        raw(1, username=" ", amount="10.05", currency="kzt"),
        "2026-09-06T12:00:01+00:00",
    )

    assert item.username == "Аноним"
    assert item.amount_tenths == 101
    assert item.currency == "KZT"
    assert item.to_public_dict()["supportedCurrency"] is True

    for source_id, currency in ((2, "pln"), (3, "uzs")):
        supported = normalize_donation(
            raw(source_id, currency=currency),
            "2026-09-06T12:00:01+00:00",
        )
        assert supported.currency == currency.upper()
        assert supported.to_public_dict()["supportedCurrency"] is True

    unsupported = normalize_donation(
        raw(4, currency="gbp"),
        "2026-09-06T12:00:01+00:00",
    )
    assert unsupported.to_public_dict()["supportedCurrency"] is False


def test_invalid_donation_does_not_advance_cursor(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    database.set_state(LAST_SEEN_ID_KEY, "1")
    sync = service(database, FakeSource({1: [raw(2, amount="invalid"), raw(1)]}))

    with pytest.raises(DonationAlertsError):
        sync.sync_once()

    assert database.get_state(LAST_SEEN_ID_KEY) == "1"
    assert database.list_pending(100) == []


def test_history_scan_archives_new_ids_as_regular_without_moving_live_cursor(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    database.insert_donations(
        [
            normalize_donation(
                raw(6, created_at="2026-09-06 12:00:00"),
                "2026-09-06T12:00:01+00:00",
                is_chat=True,
            )
        ]
    )
    database.acknowledge("6", "2026-09-06T12:01:00+00:00")
    database.set_state(LAST_SEEN_ID_KEY, "6")
    source = FakeSource(
        {
            1: [
                raw(6, created_at="2026-09-06 12:00:00"),
                raw(5, created_at="2026-09-06 11:00:00"),
            ],
            2: [
                raw(4, created_at="2026-09-06 10:00:00"),
                raw(3, created_at="2026-09-06 09:00:00"),
            ],
            3: [raw(2, created_at="2026-09-06 08:00:00")],
        }
    )

    result = service(database, source).scan_history_since(
        "2026-09-06T09:30:00+00:00",
        {"RUB"},
    )

    assert result.fetched == 4
    assert result.matched == 3
    assert result.archived == 2
    assert database.get_state(LAST_SEEN_ID_KEY) == "6"
    assert database.get_state(HISTORY_OLDEST_AT_KEY) == "2026-09-06T09:30:00+00:00"
    assert database.list_pending(100) == []
    assert [
        (item.source_id, item.is_chat)
        for item in database.list_acknowledged_since(result.since)
    ] == [
        ("6", True),
        ("4", False),
        ("5", False),
    ]


def test_wider_history_scan_only_archives_the_new_older_interval(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    source = FakeSource(
        {
            1: [
                raw(5, created_at="2026-09-06 12:00:00"),
                raw(4, created_at="2026-09-06 11:00:00"),
            ],
            2: [
                raw(3, created_at="2026-09-04 12:00:00"),
                raw(2, created_at="2026-09-02 12:00:00"),
            ],
            3: [raw(1, created_at="2026-08-31 12:00:00")],
        }
    )
    sync = service(database, source)

    first = sync.scan_history_since("2026-09-03T12:00:00+00:00", {"RUB"})
    second = sync.scan_history_since("2026-09-01T12:00:00+00:00", {"RUB"})

    assert first.archived == 3
    assert second.archived == 1
    assert database.count_by_status("acknowledged") == 4
    assert database.get_state(HISTORY_OLDEST_AT_KEY) == "2026-09-01T12:00:00+00:00"


def test_history_scan_skips_unsupported_currency(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    source = FakeSource(
        {
            1: [
                raw(2, currency="GBP", created_at="2026-09-06 12:00:00"),
                raw(1, created_at="2026-09-05 12:00:00"),
            ]
        }
    )

    result = service(database, source).scan_history_since(
        "2026-09-05T00:00:00+00:00",
        {"RUB"},
    )

    assert result.archived == 1
    assert result.skipped_unsupported == 1
    assert database.count_by_status("acknowledged") == 1


def test_incomplete_history_scan_does_not_save_partial_results(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    source = FakeSource(
        {
            1: [raw(3, created_at="2026-09-06 12:00:00")],
            2: [raw(2, created_at="2026-09-05 12:00:00")],
        }
    )
    sync = SyncService(
        database,
        source,
        poll_interval_seconds=5,
        import_existing=False,
        max_pages_per_sync=1,
        history_page_delay_seconds=0,
    )

    with pytest.raises(DonationAlertsError, match="before reaching the selected date"):
        sync.scan_history_since("2026-09-01T00:00:00+00:00", {"RUB"})

    assert database.count_by_status("acknowledged") == 0
    assert database.get_state(HISTORY_OLDEST_AT_KEY) is None
