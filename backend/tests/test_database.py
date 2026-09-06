import sqlite3
from dataclasses import replace

from gambalator_backend.database import Database, Donation


def donation(source_id: str, username: str = "Chel_1") -> Donation:
    return Donation(
        source_id=source_id,
        username=username,
        amount_tenths=1000,
        original_amount="100.0",
        currency="RUB",
        donated_at="2026-09-06 12:00:00",
        fetched_at="2026-09-06T12:00:01+00:00",
    )


def test_database_deduplicates_and_acknowledges(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()

    assert database.insert_donations([donation("10"), donation("10")]) == 1
    assert [item.source_id for item in database.list_pending(100)] == ["10"]
    assert database.count_by_status("pending") == 1

    assert database.acknowledge("10", "2026-09-06T12:01:00+00:00") is True
    assert database.acknowledge("10", "2026-09-06T12:02:00+00:00") is False
    assert database.list_pending(100) == []
    assert database.count_by_status("acknowledged") == 1


def test_database_persists_sync_state(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()

    assert database.get_state("cursor") is None
    database.set_state("cursor", "42")
    database.set_state("cursor", "43")

    assert database.get_state("cursor") == "43"
    assert database.get_boolean_state("auto-chat") is False
    database.set_boolean_state("auto-chat", True)
    assert database.get_boolean_state("auto-chat") is True
    assert database.toggle_boolean_state("auto-chat") is False
    assert database.get_boolean_state("auto-chat") is False


def test_database_adds_chat_attribution_to_existing_schema(tmp_path):
    path = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE sync_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE donations (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL UNIQUE,
                username TEXT NOT NULL,
                amount_tenths INTEGER NOT NULL CHECK (amount_tenths > 0),
                original_amount TEXT NOT NULL,
                currency TEXT NOT NULL,
                donated_at TEXT,
                fetched_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'acknowledged')),
                acknowledged_at TEXT
            );
            """
        )

    database = Database(path)
    database.initialize()
    assert database.insert_donations([donation("legacy-1")]) == 1
    assert database.list_pending(10)[0].is_chat is False


def test_database_requeues_only_acknowledged_donations_since_time(tmp_path):
    database = Database(tmp_path / "data.sqlite3")
    database.initialize()
    database.insert_donations(
        [
            donation("1"),
            replace(
                donation("2"),
                donated_at="2026-09-06 13:00:00",
                is_chat=True,
            ),
            replace(donation("3"), donated_at="2026-09-06 14:00:00"),
        ]
    )
    database.acknowledge("1", "2026-09-06T15:00:00+00:00")
    database.acknowledge("2", "2026-09-06T15:00:00+00:00")
    database.acknowledge("3", "2026-09-06T15:00:00+00:00")
    database.set_state("cursor", "3")

    since = "2026-09-06T13:00:00+00:00"
    assert database.count_reimportable_since(since) == 2
    assert database.count_reimportable_since(since, {"2"}) == 1
    assert database.requeue_acknowledged_since(since, {"3"}) == 1
    assert [
        (item.source_id, item.is_chat) for item in database.list_pending(10)
    ] == [("2", True)]
    assert database.requeue_acknowledged_since(since) == 1
    assert [
        (item.source_id, item.is_chat) for item in database.list_pending(10)
    ] == [("2", True), ("3", False)]
    assert database.get_state("cursor") == "3"
