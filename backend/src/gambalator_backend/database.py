from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Donation:
    source_id: str
    username: str
    amount_tenths: int
    original_amount: str
    currency: str
    donated_at: str | None
    fetched_at: str
    is_chat: bool = False

    def to_public_dict(self) -> dict[str, object]:
        return {
            "source": "donationalerts",
            "sourceId": self.source_id,
            "username": self.username,
            "amountTenths": self.amount_tenths,
            "originalAmount": self.original_amount,
            "currency": self.currency,
            "donatedAt": self.donated_at,
            "fetchedAt": self.fetched_at,
            "isChat": self.is_chat,
            "supportedCurrency": self.currency
            in {
                "RUB",
                "USD",
                "EUR",
                "BYN",
                "KZT",
                "UAH",
                "BRL",
                "TRY",
                "PLN",
                "UZS",
            },
        }


class Database:
    def __init__(self, path: Path):
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS sync_state (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS donations (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id TEXT NOT NULL UNIQUE,
                    username TEXT NOT NULL,
                    amount_tenths INTEGER NOT NULL CHECK (amount_tenths > 0),
                    original_amount TEXT NOT NULL,
                    currency TEXT NOT NULL,
                    donated_at TEXT,
                    fetched_at TEXT NOT NULL,
                    is_chat INTEGER NOT NULL DEFAULT 0
                        CHECK (is_chat IN (0, 1)),
                    status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'acknowledged')),
                    acknowledged_at TEXT
                );

                CREATE INDEX IF NOT EXISTS donations_status_sequence
                ON donations(status, sequence);
                """
            )
            donation_columns = {
                str(row["name"])
                for row in connection.execute("PRAGMA table_info(donations)").fetchall()
            }
            if "is_chat" not in donation_columns:
                connection.execute(
                    """
                    ALTER TABLE donations
                    ADD COLUMN is_chat INTEGER NOT NULL DEFAULT 0
                        CHECK (is_chat IN (0, 1))
                    """
                )

    def get_state(self, key: str) -> str | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT value FROM sync_state WHERE key = ?", (key,)
            ).fetchone()
        return None if row is None else str(row["value"])

    def set_state(self, key: str, value: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO sync_state(key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, value),
            )

    def get_boolean_state(self, key: str, *, default: bool = False) -> bool:
        value = self.get_state(key)
        return default if value is None else value == "1"

    def set_boolean_state(self, key: str, enabled: bool) -> None:
        self.set_state(key, "1" if enabled else "0")

    def toggle_boolean_state(self, key: str, *, default: bool = False) -> bool:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT value FROM sync_state WHERE key = ?", (key,)
            ).fetchone()
            current = default if row is None else str(row["value"]) == "1"
            enabled = not current
            connection.execute(
                """
                INSERT INTO sync_state(key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, "1" if enabled else "0"),
            )
        return enabled

    def insert_donations(self, donations: Iterable[Donation]) -> int:
        inserted = 0
        with self._connect() as connection:
            for donation in donations:
                cursor = connection.execute(
                    """
                    INSERT INTO donations(
                        source_id,
                        username,
                        amount_tenths,
                        original_amount,
                        currency,
                        donated_at,
                        fetched_at,
                        is_chat
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(source_id) DO NOTHING
                    """,
                    (
                        donation.source_id,
                        donation.username,
                        donation.amount_tenths,
                        donation.original_amount,
                        donation.currency,
                        donation.donated_at,
                        donation.fetched_at,
                        int(donation.is_chat),
                    ),
                )
                inserted += cursor.rowcount
        return inserted

    def list_pending(self, limit: int) -> list[Donation]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT source_id, username, amount_tenths, original_amount,
                       currency, donated_at, fetched_at, is_chat
                FROM donations
                WHERE status = 'pending'
                ORDER BY sequence ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [
            Donation(
                source_id=str(row["source_id"]),
                username=str(row["username"]),
                amount_tenths=int(row["amount_tenths"]),
                original_amount=str(row["original_amount"]),
                currency=str(row["currency"]),
                donated_at=None
                if row["donated_at"] is None
                else str(row["donated_at"]),
                fetched_at=str(row["fetched_at"]),
                is_chat=bool(row["is_chat"]),
            )
            for row in rows
        ]

    def acknowledge(self, source_id: str, acknowledged_at: str) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE donations
                SET status = 'acknowledged', acknowledged_at = ?
                WHERE source_id = ? AND status = 'pending'
                """,
                (acknowledged_at, source_id),
            )
        return cursor.rowcount == 1

    def count_reimportable_since(
        self,
        since: str,
        exclude_source_ids: Iterable[str] = (),
    ) -> int:
        excluded = set(exclude_source_ids)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT source_id
                FROM donations
                WHERE status = 'acknowledged'
                  AND datetime(COALESCE(donated_at, fetched_at)) >= datetime(?)
                """,
                (since,),
            ).fetchall()
        return sum(str(row["source_id"]) not in excluded for row in rows)

    def requeue_acknowledged_since(
        self,
        since: str,
        exclude_source_ids: Iterable[str] = (),
    ) -> int:
        excluded = set(exclude_source_ids)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            rows = connection.execute(
                """
                SELECT source_id
                FROM donations
                WHERE status = 'acknowledged'
                  AND datetime(COALESCE(donated_at, fetched_at)) >= datetime(?)
                """,
                (since,),
            ).fetchall()
            source_ids = [
                str(row["source_id"])
                for row in rows
                if str(row["source_id"]) not in excluded
            ]
            requeued = 0
            for source_id in source_ids:
                cursor = connection.execute(
                    """
                    UPDATE donations
                    SET status = 'pending', acknowledged_at = NULL
                    WHERE source_id = ? AND status = 'acknowledged'
                    """,
                    (source_id,),
                )
                requeued += cursor.rowcount
        return requeued

    def count_by_status(self, status: str) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT COUNT(*) AS total FROM donations WHERE status = ?", (status,)
            ).fetchone()
        return int(row["total"])
