from gambalator_backend.calculator import CalculatorService
from gambalator_backend.database import Database, Donation


def build_calculator(tmp_path):
    database = Database(tmp_path / "calculator.sqlite3")
    database.initialize()
    return CalculatorService(database), database


def active_entry(
    entry_id: str, nickname: str, amount_tenths: int, *, is_chat: bool = False
):
    entry = {
        "id": entry_id,
        "nickname": nickname,
        "amountTenths": amount_tenths,
        "currency": "RUB",
        "status": "active",
    }
    if is_chat:
        entry["isChat"] = True
    return entry


def test_calculate_one_round_leaves_the_second_round_active(tmp_path):
    calculator, _database = build_calculator(tmp_path)
    calculator.apply_action(
        {"type": "entry/add", "entry": active_entry("1", "First", 50_000)}
    )
    calculator.apply_action(
        {"type": "entry/add", "entry": active_entry("2", "Second", 50_000)}
    )

    assert calculator.overlay_state() == {
        "currentRubTenths": 100_000,
        "targetRubTenths": 50_000,
        "availableRounds": 2,
        "revision": 3,
    }

    result = calculator.calculate_one_round()

    assert result.calculation["completedRounds"] == 1
    assert [item["winner"] for item in result.state["history"]] == ["First"]
    assert [
        item["nickname"]
        for item in result.state["entries"]
        if item["status"] == "active"
    ] == ["Second"]
    assert calculator.overlay_state()["currentRubTenths"] == 50_000


def test_regular_closer_excludes_chat_donations_from_winner(tmp_path):
    calculator, _database = build_calculator(tmp_path)
    for entry in [
        active_entry("1", "Chat donor", 35_000, is_chat=True),
        active_entry("2", "Smaller", 5_000),
        active_entry("3", "Winner", 10_000),
    ]:
        calculator.apply_action({"type": "entry/add", "entry": entry})

    result = calculator.apply_action(
        {"type": "calculation/run", "maxRounds": None}
    )

    assert result.state["history"][-1] | {"id": "ignored"} == {
        "id": "ignored",
        "roundNumber": 1,
        "targetRubTenths": 50_000,
        "winner": "Winner",
        "winningRubTenths": 10_000,
        "isChatWinner": False,
        "isLatest": True,
    }


def test_chat_closer_forces_chat_winner(tmp_path):
    calculator, _database = build_calculator(tmp_path)
    for entry in [
        active_entry("1", "Largest regular donor", 30_000),
        active_entry("2", "Other regular donor", 19_000),
        active_entry("3", "Closing Chat donor", 1_000, is_chat=True),
    ]:
        calculator.apply_action({"type": "entry/add", "entry": entry})

    result = calculator.apply_action(
        {"type": "calculation/run", "maxRounds": None}
    )

    assert result.state["history"][-1]["winner"] == "Chat"
    assert result.state["history"][-1]["winningRubTenths"] == 1_000
    assert result.state["history"][-1]["isChatWinner"] is True


def test_split_donation_decides_chat_mode_at_each_round_boundary(tmp_path):
    calculator, _database = build_calculator(tmp_path)
    calculator.apply_action(
        {
            "type": "entry/add",
            "entry": active_entry("1", "Chat donor", 60_000, is_chat=True),
        }
    )
    calculator.apply_action(
        {
            "type": "entry/add",
            "entry": active_entry("2", "Regular closer", 40_000),
        }
    )

    result = calculator.apply_action(
        {"type": "calculation/run", "maxRounds": None}
    )

    assert [item["winner"] for item in result.state["history"]] == [
        "Chat",
        "Regular closer",
    ]
    assert [item["winningRubTenths"] for item in result.state["history"]] == [
        50_000,
        40_000,
    ]
    assert [item["isChatWinner"] for item in result.state["history"]] == [True, False]


def test_pending_donation_is_imported_and_acknowledged_without_a_browser(tmp_path):
    calculator, database = build_calculator(tmp_path)
    database.insert_donations(
        [
            Donation(
                source_id="99",
                username="Donor",
                amount_tenths=50_000,
                original_amount="5000",
                currency="RUB",
                donated_at="2026-09-12T10:00:00+00:00",
                fetched_at="2026-09-12T10:00:01+00:00",
            )
        ]
    )

    assert calculator.reconcile_pending_donations() == 1
    assert database.count_by_status("pending") == 0
    assert calculator.overlay_state()["currentRubTenths"] == 50_000
    assert calculator.reconcile_pending_donations() == 0
    assert len(calculator.get_state().state["entries"]) == 1


def test_explicit_history_import_restores_full_donation_ignored_by_consumed_part(
    tmp_path,
):
    calculator, database = build_calculator(tmp_path)
    calculator.apply_action(
        {"type": "entry/add", "entry": active_entry("prefix", "First", 48_720)}
    )
    database.insert_donations(
        [
            Donation(
                source_id="99",
                username="Replay donor",
                amount_tenths=20_000,
                original_amount="2000",
                currency="RUB",
                donated_at="2026-09-12T10:00:00+00:00",
                fetched_at="2026-09-12T10:00:01+00:00",
            )
        ]
    )
    calculator.reconcile_pending_donations()
    calculated = calculator.calculate_one_round()
    remainder = next(
        item
        for item in calculated.state["entries"]
        if item["status"] == "active"
        and item.get("importReference", {}).get("externalId") == "99"
    )
    assert remainder["amountTenths"] == 18_720

    calculator.apply_action({"type": "entry/remove", "id": remainder["id"]})
    since = "2026-09-12T00:00:00+00:00"

    assert calculator.count_historical_reimport(since) == 1
    assert calculator.reimport_historical_donations(since) == 1

    restored = calculator.get_state().state
    matching = [
        item
        for item in restored["entries"]
        if item.get("importReference", {}).get("externalId") == "99"
    ]
    assert [(item["status"], item["amountTenths"]) for item in matching] == [
        ("consumed", 1_280),
        ("active", 20_000),
    ]
    assert len({item["id"] for item in matching}) == 2
    assert len(restored["history"]) == 1
    assert calculator.reimport_historical_donations(since) == 0


def test_normal_reconciliation_still_deduplicates_against_consumed_entries(tmp_path):
    calculator, database = build_calculator(tmp_path)
    imported_entry = active_entry("donationalerts:100", "Already calculated", 50_000)
    imported_entry["importReference"] = {
        "provider": "donationalerts",
        "externalId": "100",
        "donatedAt": "2026-09-12T11:00:00+00:00",
    }
    calculator.apply_action({"type": "entry/add", "entry": imported_entry})
    calculator.calculate_one_round()
    database.insert_donations(
        [
            Donation(
                source_id="100",
                username="Already calculated",
                amount_tenths=50_000,
                original_amount="5000",
                currency="RUB",
                donated_at="2026-09-12T11:00:00+00:00",
                fetched_at="2026-09-12T11:00:01+00:00",
            )
        ]
    )

    assert calculator.reconcile_pending_donations() == 1

    entries = calculator.get_state().state["entries"]
    assert len(entries) == 1
    assert entries[0]["status"] == "consumed"
    assert database.count_by_status("pending") == 0


def test_explicit_history_import_uses_new_id_after_unsplit_donation_was_consumed(
    tmp_path,
):
    calculator, database = build_calculator(tmp_path)
    database.insert_donations(
        [
            Donation(
                source_id="101",
                username="Full round donor",
                amount_tenths=50_000,
                original_amount="5000",
                currency="RUB",
                donated_at="2026-09-12T12:00:00+00:00",
                fetched_at="2026-09-12T12:00:01+00:00",
            )
        ]
    )
    calculator.reconcile_pending_donations()
    calculator.calculate_one_round()

    assert calculator.reimport_historical_donations(
        "2026-09-12T00:00:00+00:00"
    ) == 1

    entries = calculator.get_state().state["entries"]
    consumed = next(item for item in entries if item["status"] == "consumed")
    active = next(item for item in entries if item["status"] == "active")
    assert consumed["id"] == "donationalerts:101"
    assert active["id"].startswith("donationalerts-replay:101:")
    assert active["id"] != consumed["id"]
    assert active["amountTenths"] == 50_000
