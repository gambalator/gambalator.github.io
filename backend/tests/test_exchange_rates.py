import pytest
import requests

from gambalator_backend.exchange_rates import (
    CBR_DAILY_RATES_URL,
    CbrExchangeRateClient,
    ExchangeRateError,
    parse_cbr_daily_rates,
)

CBR_XML = b"""<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="08.09.2026" name="Foreign Currency Market">
  <Valute><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>92,3456</Value></Valute>
  <Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>78,4756</Value></Valute>
  <Valute><CharCode>BYN</CharCode><Nominal>1</Nominal><Value>27,1457</Value></Valute>
  <Valute><CharCode>KZT</CharCode><Nominal>100</Nominal><Value>15,6789</Value></Valute>
  <Valute><CharCode>UAH</CharCode><Nominal>10</Nominal><Value>17,5282</Value></Valute>
  <Valute><CharCode>BRL</CharCode><Nominal>1</Nominal><Value>15,4550</Value></Valute>
  <Valute><CharCode>TRY</CharCode><Nominal>10</Nominal><Value>18,0499</Value></Valute>
  <Valute><CharCode>PLN</CharCode><Nominal>1</Nominal><Value>23,2414</Value></Valute>
  <Valute><CharCode>UZS</CharCode><Nominal>10000</Nominal><Value>73,1342</Value></Valute>
</ValCurs>
"""


class FakeSession:
    def __init__(self, response: requests.Response):
        self.response = response
        self.headers: dict[str, str] = {}
        self.requested_url: str | None = None
        self.timeout: float | None = None

    def get(self, url: str, *, timeout: float):
        self.requested_url = url
        self.timeout = timeout
        return self.response


def response_with(content: bytes, status_code: int = 200) -> requests.Response:
    response = requests.Response()
    response.status_code = status_code
    response._content = content
    response.url = CBR_DAILY_RATES_URL
    return response


def test_cbr_rates_are_normalized_to_the_units_used_by_gambalator():
    snapshot = parse_cbr_daily_rates(CBR_XML)

    assert snapshot.effective_date == "2026-09-08"
    assert snapshot.rates_tenths == {
        "EUR": 923,
        "USD": 785,
        "BYN": 271,
        "KZT": 157,
        "UAH": 175,
        "BRL": 155,
        "TRY": 180,
        "PLN": 232,
        "UZS": 731,
    }


def test_cbr_client_uses_the_official_endpoint_and_timeout():
    session = FakeSession(response_with(CBR_XML))
    client = CbrExchangeRateClient(timeout_seconds=7.5, session=session)

    snapshot = client.fetch_latest()

    assert snapshot.effective_date == "2026-09-08"
    assert session.requested_url == CBR_DAILY_RATES_URL
    assert session.timeout == 7.5


def test_cbr_response_must_contain_every_supported_foreign_currency():
    incomplete = CBR_XML.replace(
        b"<Valute><CharCode>TRY</CharCode><Nominal>10</Nominal><Value>18,0499</Value></Valute>",
        b"",
    )

    with pytest.raises(ExchangeRateError, match="TRY"):
        parse_cbr_daily_rates(incomplete)
