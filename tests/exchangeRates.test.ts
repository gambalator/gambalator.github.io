import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchExchangeRatesIfNeeded,
  getLastExchangeRateSyncDate,
} from '../src/integrations/exchangeRates'

function rateResponse(): Response {
  return new Response(
    JSON.stringify({
      source: 'Банк России',
      sourceUrl: 'https://www.cbr.ru/scripts/XML_daily.asp',
      effectiveDate: '2026-09-08',
      rates: [
        { currency: 'EUR', units: 1, rubTenths: 923 },
        { currency: 'USD', units: 1, rubTenths: 785 },
        { currency: 'BYN', units: 1, rubTenths: 271 },
        { currency: 'KZT', units: 100, rubTenths: 157 },
        { currency: 'UAH', units: 10, rubTenths: 175 },
        { currency: 'BRL', units: 1, rubTenths: 155 },
        { currency: 'TRY', units: 10, rubTenths: 180 },
        { currency: 'PLN', units: 1, rubTenths: 232 },
        { currency: 'UZS', units: 10_000, rubTenths: 731 },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('daily exchange-rate refresh', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 8, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fetches once per local calendar day after a successful response', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(rateResponse()),
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = await fetchExchangeRatesIfNeeded()
    const second = await fetchExchangeRatesIfNeeded()

    expect(first?.ratesTenths.USD).toBe(785)
    expect(first?.ratesTenths.PLN).toBe(232)
    expect(first?.ratesTenths.UZS).toBe(731)
    expect(second).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getLastExchangeRateSyncDate()).toBe('2026-09-08')

    vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0))
    const nextDay = await fetchExchangeRatesIfNeeded()
    expect(nextDay?.ratesTenths.USD).toBe(785)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getLastExchangeRateSyncDate()).toBe('2026-09-09')
  })

  it('does not mark a failed request as a successful daily sync', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchExchangeRatesIfNeeded()).rejects.toThrow('offline')
    await expect(fetchExchangeRatesIfNeeded()).rejects.toThrow('offline')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getLastExchangeRateSyncDate()).toBeNull()
  })
})
