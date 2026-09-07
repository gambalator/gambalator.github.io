from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Protocol
from xml.etree import ElementTree

import requests

CBR_DAILY_RATES_URL = "https://www.cbr.ru/scripts/XML_daily.asp"
MAX_RESPONSE_BYTES = 1_000_000
RATE_UNITS = {
    "EUR": 1,
    "USD": 1,
    "BYN": 1,
    "KZT": 100,
    "UAH": 10,
    "BRL": 1,
    "TRY": 10,
    "PLN": 1,
    "UZS": 10_000,
}


class ExchangeRateError(RuntimeError):
    """Raised when current exchange rates cannot be loaded or parsed."""


@dataclass(frozen=True, slots=True)
class ExchangeRateSnapshot:
    effective_date: str
    rates_tenths: dict[str, int]

    def to_public_dict(self) -> dict[str, object]:
        return {
            "source": "Банк России",
            "sourceUrl": CBR_DAILY_RATES_URL,
            "effectiveDate": self.effective_date,
            "rates": [
                {
                    "currency": currency,
                    "units": units,
                    "rubTenths": self.rates_tenths[currency],
                }
                for currency, units in RATE_UNITS.items()
            ],
        }


class ExchangeRateSource(Protocol):
    def fetch_latest(self) -> ExchangeRateSnapshot: ...


class CbrExchangeRateClient:
    def __init__(
        self,
        *,
        timeout_seconds: float,
        session: requests.Session | None = None,
    ):
        self.timeout_seconds = timeout_seconds
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/xml",
                "User-Agent": "Gambalator/1.0 local-backend",
            }
        )

    def fetch_latest(self) -> ExchangeRateSnapshot:
        try:
            response = self.session.get(
                CBR_DAILY_RATES_URL,
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
        except requests.RequestException as error:
            raise ExchangeRateError(f"Bank of Russia request failed: {error}") from error

        if len(response.content) > MAX_RESPONSE_BYTES:
            raise ExchangeRateError("Bank of Russia returned an unexpectedly large response")
        return parse_cbr_daily_rates(response.content)


def parse_cbr_daily_rates(payload: bytes) -> ExchangeRateSnapshot:
    try:
        root = ElementTree.fromstring(payload)
    except ElementTree.ParseError as error:
        raise ExchangeRateError("Bank of Russia returned invalid XML") from error

    raw_date = root.attrib.get("Date", "")
    try:
        effective_date = datetime.strptime(raw_date, "%d.%m.%Y").date().isoformat()
    except ValueError as error:
        raise ExchangeRateError("Bank of Russia returned an invalid rate date") from error

    rates_tenths: dict[str, int] = {}
    for item in root.findall("Valute"):
        currency = (item.findtext("CharCode") or "").strip().upper()
        if currency not in RATE_UNITS:
            continue
        try:
            nominal = Decimal((item.findtext("Nominal") or "").strip())
            value = Decimal((item.findtext("Value") or "").strip().replace(",", "."))
            if nominal <= 0 or value <= 0:
                raise InvalidOperation
            requested_value = value * RATE_UNITS[currency] / nominal
            rates_tenths[currency] = int(
                (requested_value * 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            )
        except (InvalidOperation, ValueError, ZeroDivisionError) as error:
            raise ExchangeRateError(
                f"Bank of Russia returned an invalid {currency} rate"
            ) from error

    missing = [currency for currency in RATE_UNITS if currency not in rates_tenths]
    if missing:
        raise ExchangeRateError(
            f"Bank of Russia response is missing rates: {', '.join(missing)}"
        )

    return ExchangeRateSnapshot(
        effective_date=effective_date,
        rates_tenths=rates_tenths,
    )
