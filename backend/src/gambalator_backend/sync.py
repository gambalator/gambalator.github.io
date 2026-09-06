from __future__ import annotations

import threading
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from .database import Database, Donation
from .donationalerts import DonationAlertsError, DonationSource

LAST_SEEN_ID_KEY = "donationalerts.last_seen_id"
LAST_SUCCESS_AT_KEY = "donationalerts.last_success_at"
BASELINE_INITIALIZED_KEY = "donationalerts.baseline_initialized"
AUTO_CHAT_STATE_KEY = "donationalerts.auto_chat"


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def normalize_donation(
    payload: dict[str, Any],
    fetched_at: str,
    *,
    is_chat: bool = False,
) -> Donation:
    source_id = str(payload.get("id", "")).strip()
    if not source_id:
        raise DonationAlertsError("Donation resource does not contain an id")

    username_value = payload.get("username")
    username = str(username_value).strip() if username_value is not None else ""
    if not username:
        username = "Аноним"

    try:
        amount = Decimal(str(payload["amount"]))
    except (KeyError, InvalidOperation, ValueError) as error:
        raise DonationAlertsError(f"Donation {source_id} has an invalid amount") from error
    if not amount.is_finite() or amount <= 0:
        raise DonationAlertsError(f"Donation {source_id} has a non-positive amount")

    amount_tenths = int((amount * 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    currency = str(payload.get("currency", "")).strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        raise DonationAlertsError(f"Donation {source_id} has an invalid currency")

    donated_at_value = payload.get("created_at")
    donated_at = str(donated_at_value).strip() if donated_at_value else None

    return Donation(
        source_id=source_id,
        username=username,
        amount_tenths=amount_tenths,
        original_amount=format(amount, "f"),
        currency=currency,
        donated_at=donated_at,
        fetched_at=fetched_at,
        is_chat=is_chat,
    )


@dataclass(frozen=True, slots=True)
class SyncResult:
    baseline_created: bool
    fetched: int
    inserted: int
    newest_id: str | None


class SyncStatus:
    def __init__(self, configured: bool):
        self._lock = threading.Lock()
        self._state: dict[str, object] = {
            "configured": configured,
            "running": False,
            "lastAttemptAt": None,
            "lastSuccessAt": None,
            "lastError": None,
            "insertedLastSync": 0,
        }

    def update(self, **values: object) -> None:
        with self._lock:
            self._state.update(values)

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return dict(self._state)


class SyncService:
    def __init__(
        self,
        database: Database,
        source: DonationSource | None,
        *,
        poll_interval_seconds: float,
        import_existing: bool,
        max_pages_per_sync: int,
    ):
        self.database = database
        self.source = source
        self.poll_interval_seconds = poll_interval_seconds
        self.import_existing = import_existing
        self.max_pages_per_sync = max_pages_per_sync
        self.status = SyncStatus(configured=source is not None)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._sync_lock = threading.Lock()

    def sync_once(self) -> SyncResult:
        if self.source is None:
            raise DonationAlertsError("DonationAlerts access token is not configured")

        with self._sync_lock:
            attempted_at = utc_now()
            self.status.update(lastAttemptAt=attempted_at, lastError=None)
            try:
                result = self._perform_sync(attempted_at)
            except Exception as error:
                self.status.update(lastError=str(error))
                raise

            completed_at = utc_now()
            self.database.set_state(LAST_SUCCESS_AT_KEY, completed_at)
            self.status.update(
                lastSuccessAt=completed_at,
                lastError=None,
                insertedLastSync=result.inserted,
            )
            return result

    def _perform_sync(self, fetched_at: str) -> SyncResult:
        assert self.source is not None
        last_seen_id = self.database.get_state(LAST_SEEN_ID_KEY)
        baseline_initialized = (
            last_seen_id is not None
            or self.database.get_state(BASELINE_INITIALIZED_KEY) == "1"
        )
        collected: list[Donation] = []
        auto_chat_enabled = self.database.get_boolean_state(AUTO_CHAT_STATE_KEY)
        newest_id: str | None = None
        cursor_found = last_seen_id is None
        reached_last_page = False

        for requested_page in range(1, self.max_pages_per_sync + 1):
            page = self.source.fetch_page(requested_page)
            if requested_page == 1 and page.items:
                newest_id = str(page.items[0].get("id", "")).strip() or None

            if not baseline_initialized and not self.import_existing:
                if newest_id is not None:
                    self.database.set_state(LAST_SEEN_ID_KEY, newest_id)
                self.database.set_state(BASELINE_INITIALIZED_KEY, "1")
                return SyncResult(
                    baseline_created=True,
                    fetched=len(page.items),
                    inserted=0,
                    newest_id=newest_id,
                )

            stop_at_cursor = False
            for payload in page.items:
                source_id = str(payload.get("id", "")).strip()
                if last_seen_id is not None and source_id == last_seen_id:
                    cursor_found = True
                    stop_at_cursor = True
                    break
                collected.append(
                    normalize_donation(
                        payload,
                        fetched_at,
                        is_chat=auto_chat_enabled,
                    )
                )

            if stop_at_cursor:
                break
            if page.current_page >= page.last_page or not page.items:
                reached_last_page = True
                break
        else:
            raise DonationAlertsError(
                "Catch-up exceeded GAMBALATOR_MAX_PAGES_PER_SYNC before reaching the saved id"
            )

        if last_seen_id is not None and not cursor_found and not reached_last_page:
            raise DonationAlertsError("Saved DonationAlerts id was not reached")

        inserted = self.database.insert_donations(reversed(collected))
        if newest_id is not None:
            self.database.set_state(LAST_SEEN_ID_KEY, newest_id)
        self.database.set_state(BASELINE_INITIALIZED_KEY, "1")
        return SyncResult(
            baseline_created=False,
            fetched=len(collected),
            inserted=inserted,
            newest_id=newest_id,
        )

    def start(self) -> None:
        if self.source is None or self._thread is not None:
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name="donationalerts-sync",
            daemon=True,
        )
        self._thread.start()

    def set_source(self, source: DonationSource | None) -> None:
        self.source = source
        self.status.update(configured=source is not None, lastError=None)

    def stop(self) -> None:
        self._stop_event.set()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=min(self.poll_interval_seconds + 1, 10))
        self._thread = None

    def _run(self) -> None:
        self.status.update(running=True)
        try:
            while not self._stop_event.is_set():
                with suppress(Exception):
                    self.sync_once()
                self._stop_event.wait(self.poll_interval_seconds)
        finally:
            self.status.update(running=False)
