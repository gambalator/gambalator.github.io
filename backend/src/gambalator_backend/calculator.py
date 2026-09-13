from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from .database import Database, Donation

CALCULATOR_SCHEMA_VERSION = 1
MAX_SAFE_INTEGER = 2**53 - 1
SUPPORTED_CURRENCIES = {
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
}
RATE_SETTINGS = {
    "EUR": ("eurRateTenths", 1),
    "USD": ("usdRateTenths", 1),
    "BYN": ("bynRateTenths", 1),
    "KZT": ("kztRateTenths", 100),
    "UAH": ("uahRateTenths", 10),
    "BRL": ("brlRateTenths", 1),
    "TRY": ("tryRateTenths", 10),
    "PLN": ("plnRateTenths", 1),
    "UZS": ("uzsRateTenths", 10_000),
}
DEFAULT_SETTINGS = {
    "roundTargetTenths": 50_000,
    "eurRateTenths": 1_000,
    "usdRateTenths": 855,
    "bynRateTenths": 282,
    "kztRateTenths": 190,
    "uahRateTenths": 194,
    "brlRateTenths": 170,
    "tryRateTenths": 179,
    "plnRateTenths": 232,
    "uzsRateTenths": 731,
}
DEFAULT_STATE: dict[str, Any] = {
    "settings": DEFAULT_SETTINGS,
    "entries": [],
    "history": [],
}


class CalculatorError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class CalculatorSnapshot:
    state: dict[str, Any]
    revision: int
    calculation: dict[str, int] | None = None

    def to_public_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"state": self.state, "revision": self.revision}
        if self.calculation is not None:
            result["calculation"] = self.calculation
        return result


def _json(state: dict[str, Any]) -> str:
    return json.dumps(state, ensure_ascii=False, separators=(",", ":"))


def _load_state(raw: str) -> dict[str, Any]:
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise CalculatorError("Stored calculator state is invalid")
    return value


def _positive_integer(value: object, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise CalculatorError(f"{field} must be a positive integer")
    if value > MAX_SAFE_INTEGER:
        raise CalculatorError(f"{field} is too large")
    return value


def _validate_settings(value: object) -> dict[str, int]:
    if not isinstance(value, dict):
        raise CalculatorError("settings must be an object")
    expected = set(DEFAULT_SETTINGS)
    if set(value) != expected:
        raise CalculatorError("settings fields are invalid")
    return {key: _positive_integer(value[key], key) for key in DEFAULT_SETTINGS}


def _validate_entry(value: object, *, active_only: bool = False) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise CalculatorError("entry must be an object")
    entry = deepcopy(value)
    entry_id = entry.get("id")
    nickname = entry.get("nickname")
    currency = entry.get("currency")
    status = entry.get("status")
    if not isinstance(entry_id, str) or not entry_id.strip():
        raise CalculatorError("entry.id is required")
    if not isinstance(nickname, str) or not nickname.strip():
        raise CalculatorError("entry.nickname is required")
    if currency not in SUPPORTED_CURRENCIES:
        raise CalculatorError("entry.currency is unsupported")
    if status not in {"active", "consumed"} or (active_only and status != "active"):
        raise CalculatorError("entry.status is invalid")
    _positive_integer(entry.get("amountTenths"), "entry.amountTenths")
    if "isChat" in entry and not isinstance(entry["isChat"], bool):
        raise CalculatorError("entry.isChat must be a boolean")
    entry["id"] = entry_id.strip()
    entry["nickname"] = nickname.strip()
    return entry


def _rate_for(currency: str, settings: dict[str, int]) -> int:
    if currency == "RUB":
        return 10
    setting, _ = RATE_SETTINGS[currency]
    return settings[setting]


def _rate_units_for(currency: str) -> int:
    if currency == "RUB":
        return 1
    _, units = RATE_SETTINGS[currency]
    return units


def convert_to_rub_tenths(entry: dict[str, Any], settings: dict[str, int]) -> int:
    amount = int(entry["amountTenths"])
    currency = str(entry["currency"])
    if currency == "RUB":
        return amount
    product = amount * _rate_for(currency, settings)
    if product > MAX_SAFE_INTEGER:
        raise CalculatorError("Money value is too large to calculate safely")
    divisor = _rate_units_for(currency) * 10
    return (product + divisor // 2) // divisor


def _next_round_number(state: dict[str, Any]) -> int:
    entry_rounds = [
        int(entry.get("roundNumber", 0))
        for entry in state["entries"]
        if entry.get("status") == "consumed"
    ]
    history_rounds = [int(result.get("roundNumber", 0)) for result in state["history"]]
    return max([0, *entry_rounds, *history_rounds]) + 1


def _source_for(entry: dict[str, Any], settings: dict[str, int]) -> dict[str, Any]:
    if isinstance(entry.get("sourceReference"), dict):
        return deepcopy(entry["sourceReference"])
    result: dict[str, Any] = {
        "amountTenths": entry["amountTenths"],
        "currency": entry["currency"],
    }
    if entry["currency"] != "RUB":
        result["rateTenths"] = _rate_for(entry["currency"], settings)
        result["rateUnits"] = _rate_units_for(entry["currency"])
    return result


def _new_id() -> str:
    return str(uuid.uuid4())


def calculate_rounds(state: dict[str, Any], max_rounds: int | None) -> dict[str, int]:
    settings = state["settings"]
    target = int(settings["roundTargetTenths"])
    active = [entry for entry in state["entries"] if entry["status"] == "active"]
    consumed = [entry for entry in state["entries"] if entry["status"] == "consumed"]
    converted = [(entry, convert_to_rub_tenths(entry, settings)) for entry in active]
    total = sum(value for _, value in converted)
    if total > MAX_SAFE_INTEGER:
        raise CalculatorError("Contribution total is too large to calculate safely")

    available = total // target
    completed = available if max_rounds is None else min(available, max_rounds)
    if completed == 0:
        return {"completedRounds": 0, "remainingNeededTenths": target - total}

    amount_left = completed * target
    round_remaining = target
    round_number = _next_round_number(state)
    individual_totals: dict[str, dict[str, Any]] = {}
    chat_total = 0
    new_consumed: list[dict[str, Any]] = []
    remaining_active: list[dict[str, Any]] = []
    new_results: list[dict[str, Any]] = []

    def finish_round(closing_is_chat: bool) -> None:
        nonlocal chat_total, individual_totals, round_remaining, round_number
        if closing_is_chat:
            winning = chat_total
            winners = ["Chat"]
        else:
            winning = max(item["rubTenths"] for item in individual_totals.values())
            winners = [
                item["displayName"]
                for item in individual_totals.values()
                if item["rubTenths"] == winning
            ]
        new_results.append(
            {
                "id": _new_id(),
                "roundNumber": round_number,
                "targetRubTenths": target,
                "winner": ", ".join(winners),
                "winningRubTenths": winning,
                "isChatWinner": closing_is_chat,
                "isLatest": True,
            }
        )
        round_number += 1
        round_remaining = target
        individual_totals = {}
        chat_total = 0

    for entry, rub_tenths in converted:
        if amount_left == 0:
            remaining_active.append(entry)
            continue
        entry_remaining = rub_tenths
        segments: list[tuple[int, int]] = []
        while entry_remaining > 0 and amount_left > 0:
            allocated = min(entry_remaining, round_remaining)
            is_chat = entry.get("isChat") is True
            if is_chat:
                chat_total += allocated
            else:
                nickname = entry["nickname"]
                key = str(nickname).strip().lower()
                prior = individual_totals.get(key)
                if prior is None:
                    individual_totals[key] = {
                        "displayName": str(nickname).strip(),
                        "rubTenths": allocated,
                    }
                else:
                    prior["rubTenths"] += allocated
            segments.append((round_number, allocated))
            entry_remaining -= allocated
            amount_left -= allocated
            round_remaining -= allocated
            if round_remaining == 0:
                finish_round(is_chat)

        unsplit = len(segments) == 1 and entry_remaining == 0 and segments[0][1] == rub_tenths
        if unsplit:
            updated = deepcopy(entry)
            updated.update(
                {
                    "status": "consumed",
                    "roundNumber": segments[0][0],
                    "frozenRubTenths": rub_tenths,
                }
            )
            if entry["currency"] != "RUB":
                updated["appliedRateTenths"] = _rate_for(entry["currency"], settings)
                updated["appliedRateUnits"] = _rate_units_for(entry["currency"])
            new_consumed.append(updated)
            continue

        source_reference = _source_for(entry, settings)
        for segment_round, segment_amount in segments:
            segment = {
                "id": _new_id(),
                "nickname": entry["nickname"],
                "amountTenths": segment_amount,
                "currency": "RUB",
                "status": "consumed",
                "roundNumber": segment_round,
                "frozenRubTenths": segment_amount,
                "sourceReference": source_reference,
            }
            if "isChat" in entry:
                segment["isChat"] = entry["isChat"]
            if "importReference" in entry:
                segment["importReference"] = entry["importReference"]
            new_consumed.append(segment)
        if entry_remaining > 0:
            remainder = {
                "id": _new_id(),
                "nickname": entry["nickname"],
                "amountTenths": entry_remaining,
                "currency": "RUB",
                "status": "active",
                "frozenRubTenths": entry_remaining,
                "sourceReference": source_reference,
            }
            if "isChat" in entry:
                remainder["isChat"] = entry["isChat"]
            if "importReference" in entry:
                remainder["importReference"] = entry["importReference"]
            remaining_active.append(remainder)

    for result in state["history"]:
        result["isLatest"] = False
    state["entries"] = [*consumed, *new_consumed, *remaining_active]
    state["history"] = [*state["history"], *new_results]
    remaining_total = total - completed * target
    return {
        "completedRounds": completed,
        "remainingNeededTenths": target - (remaining_total % target),
    }


def _donation_timestamp(entry: dict[str, Any]) -> tuple[float, str, str] | None:
    reference = entry.get("importReference")
    if not isinstance(reference, dict) or not reference.get("donatedAt"):
        return None
    raw = str(reference["donatedAt"])
    if len(raw) == 19 and raw[10] == " ":
        raw = f"{raw.replace(' ', 'T')}+00:00"
    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        external_id = str(reference["externalId"])
        if external_id.isdigit():
            return parsed.timestamp(), "0", f"{int(external_id):040d}"
        return parsed.timestamp(), "1", external_id
    except ValueError:
        return None


def _merge_imported(
    active: list[dict[str, Any]], imported: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    merged = list(active)
    for entry in imported:
        key = _donation_timestamp(entry)
        if key is None:
            merged.append(entry)
            continue
        last_donation = -1
        insertion = -1
        for index, current in enumerate(merged):
            if "importReference" not in current:
                continue
            last_donation = index
            current_key = _donation_timestamp(current)
            if current_key is not None and key < current_key:
                insertion = index
                break
        if insertion < 0:
            insertion = len(merged) if last_donation < 0 else last_donation + 1
        merged.insert(insertion, entry)
    return merged


def _active_donationalerts_source_ids(state: dict[str, Any]) -> set[str]:
    return {
        str(reference["externalId"])
        for entry in state["entries"]
        if entry["status"] == "active"
        and isinstance((reference := entry.get("importReference")), dict)
        and reference.get("provider") == "donationalerts"
        and "externalId" in reference
    }


class CalculatorService:
    def __init__(self, database: Database):
        self.database = database
        if self.database.get_calculator_state() is None:
            self._mutate(lambda state: None)

    def _mutate(
        self,
        operation: Callable[[dict[str, Any]], dict[str, int] | None],
    ) -> CalculatorSnapshot:
        calculation: dict[str, int] | None = None

        def transform(raw: str) -> str:
            nonlocal calculation
            state = _load_state(raw)
            calculation = operation(state)
            return _json(state)

        raw, revision = self.database.mutate_calculator_state(
            _json(deepcopy(DEFAULT_STATE)),
            transform,
            datetime.now(UTC).isoformat(),
            schema_version=CALCULATOR_SCHEMA_VERSION,
        )
        return CalculatorSnapshot(_load_state(raw), revision, calculation)

    def get_state(self) -> CalculatorSnapshot:
        stored = self.database.get_calculator_state()
        if stored is None:
            return self._mutate(lambda state: None)
        raw, revision = stored
        return CalculatorSnapshot(_load_state(raw), revision)

    def apply_action(self, payload: object) -> CalculatorSnapshot:
        if not isinstance(payload, dict) or not isinstance(payload.get("type"), str):
            raise CalculatorError("action type is required")
        action_type = payload["type"]

        def operation(state: dict[str, Any]) -> dict[str, int] | None:
            if action_type == "settings/update":
                state["settings"] = _validate_settings(payload.get("settings"))
            elif action_type == "entry/add":
                entry = _validate_entry(payload.get("entry"), active_only=True)
                if any(item["id"] == entry["id"] for item in state["entries"]):
                    raise CalculatorError("entry id already exists")
                state["entries"].append(entry)
            elif action_type == "entry/update":
                entry = _validate_entry(payload.get("entry"), active_only=True)
                for index, current in enumerate(state["entries"]):
                    if current["id"] == entry["id"] and current["status"] == "active":
                        state["entries"][index] = entry
                        break
                else:
                    raise CalculatorError("active entry was not found")
            elif action_type == "entry/remove":
                entry_id = payload.get("id")
                if not isinstance(entry_id, str):
                    raise CalculatorError("id is required")
                state["entries"] = [
                    item
                    for item in state["entries"]
                    if item["id"] != entry_id or item["status"] == "consumed"
                ]
            elif action_type == "entry/reorder":
                active_id = payload.get("activeId")
                over_id = payload.get("overId")
                active = [item for item in state["entries"] if item["status"] == "active"]
                consumed = [item for item in state["entries"] if item["status"] == "consumed"]
                try:
                    source = next(i for i, item in enumerate(active) if item["id"] == active_id)
                    target = next(i for i, item in enumerate(active) if item["id"] == over_id)
                except StopIteration as error:
                    raise CalculatorError("reorder entries were not found") from error
                moved = active.pop(source)
                active.insert(target, moved)
                state["entries"] = [*consumed, *active]
            elif action_type == "calculation/run":
                limit = payload.get("maxRounds")
                if isinstance(limit, bool) or limit not in {1, None}:
                    raise CalculatorError("maxRounds must be 1 or null")
                return calculate_rounds(state, limit)
            elif action_type == "used/clear":
                state["entries"] = [item for item in state["entries"] if item["status"] == "active"]
            elif action_type == "entries/clear":
                state["entries"] = []
            elif action_type == "history/clear":
                state["history"] = []
            else:
                raise CalculatorError("unsupported calculator action")
            return None

        return self._mutate(operation)

    def calculate_one_round(self) -> CalculatorSnapshot:
        return self.apply_action({"type": "calculation/run", "maxRounds": 1})

    def count_historical_reimport(self, since: str) -> int:
        donations = self.database.list_acknowledged_since(since)
        active_source_ids = _active_donationalerts_source_ids(self.get_state().state)
        return sum(
            item.currency in SUPPORTED_CURRENCIES
            and item.source_id not in active_source_ids
            for item in donations
        )

    def reimport_historical_donations(self, since: str) -> int:
        donations = [
            item
            for item in self.database.list_acknowledged_since(since)
            if item.currency in SUPPORTED_CURRENCIES
        ]
        imported_count = 0

        def operation(state: dict[str, Any]) -> None:
            nonlocal imported_count
            active_source_ids = _active_donationalerts_source_ids(state)
            imported = [
                self._entry_from_donation(item, replay=True)
                for item in donations
                if item.source_id not in active_source_ids
            ]
            imported_count = len(imported)
            if not imported:
                return
            consumed = [item for item in state["entries"] if item["status"] == "consumed"]
            active = [item for item in state["entries"] if item["status"] == "active"]
            state["entries"] = [*consumed, *_merge_imported(active, imported)]

        self._mutate(operation)
        return imported_count

    def reconcile_pending_donations(self) -> int:
        pending = self.database.list_pending(100_000)
        supported = [item for item in pending if item.currency in SUPPORTED_CURRENCIES]
        if not supported:
            return 0
        source_ids = {item.source_id for item in supported}

        def operation(state: dict[str, Any]) -> None:
            existing = {
                str(reference["externalId"])
                for entry in state["entries"]
                if isinstance((reference := entry.get("importReference")), dict)
                and reference.get("provider") == "donationalerts"
                and "externalId" in reference
            }
            imported = [
                self._entry_from_donation(item)
                for item in supported
                if item.source_id not in existing
            ]
            if not imported:
                return
            consumed = [item for item in state["entries"] if item["status"] == "consumed"]
            active = [item for item in state["entries"] if item["status"] == "active"]
            state["entries"] = [*consumed, *_merge_imported(active, imported)]

        self._mutate(operation)
        acknowledged = 0
        timestamp = datetime.now(UTC).isoformat()
        for source_id in source_ids:
            acknowledged += int(self.database.acknowledge(source_id, timestamp))
        return acknowledged

    def overlay_state(self) -> dict[str, Any]:
        snapshot = self.get_state()
        settings = snapshot.state["settings"]
        current = sum(
            convert_to_rub_tenths(entry, settings)
            for entry in snapshot.state["entries"]
            if entry["status"] == "active"
        )
        target = int(settings["roundTargetTenths"])
        return {
            "currentRubTenths": current,
            "targetRubTenths": target,
            "availableRounds": current // target,
            "revision": snapshot.revision,
        }

    @staticmethod
    def _entry_from_donation(
        donation: Donation,
        *,
        replay: bool = False,
    ) -> dict[str, Any]:
        return {
            "id": (
                f"donationalerts-replay:{donation.source_id}:{_new_id()}"
                if replay
                else f"donationalerts:{donation.source_id}"
            ),
            "nickname": donation.username,
            "isChat": donation.is_chat,
            "amountTenths": donation.amount_tenths,
            "currency": donation.currency,
            "status": "active",
            "importReference": {
                "provider": "donationalerts",
                "externalId": donation.source_id,
                "donatedAt": donation.donated_at,
            },
        }
