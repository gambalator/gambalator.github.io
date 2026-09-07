import {
  CURRENCY_RATES,
  type ForeignCurrency,
} from '../domain/currencies'
import type { CurrencyRateSettings } from '../types'

const LAST_RATE_SYNC_DATE_KEY = 'gambalator:exchange-rates:last-sync-date'
let dailyFetchInFlight: Promise<ExchangeRateSnapshot> | null = null

export interface ExchangeRateSnapshot {
  source: string
  sourceUrl: string
  effectiveDate: string
  ratesTenths: Record<ForeignCurrency, number>
}

function localDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getLastExchangeRateSyncDate(
  storage: Storage = window.localStorage,
): string | null {
  try {
    const value = storage.getItem(LAST_RATE_SYNC_DATE_KEY)
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
  } catch {
    return null
  }
}

function rememberExchangeRateSync(
  now: Date = new Date(),
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(LAST_RATE_SYNC_DATE_KEY, localDateKey(now))
  } catch {
    // Rate caching is optional; the current saved rates remain available.
  }
}

interface ExchangeRateItem {
  currency: ForeignCurrency
  units: number
  rubTenths: number
}

interface ExchangeRateResponse {
  source: string
  sourceUrl: string
  effectiveDate: string
  rates: ExchangeRateItem[]
}

function isExchangeRateResponse(value: unknown): value is ExchangeRateResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<ExchangeRateResponse>
  const rates = response.rates
  if (
    typeof response.source !== 'string' ||
    typeof response.sourceUrl !== 'string' ||
    typeof response.effectiveDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(response.effectiveDate) ||
    !Array.isArray(rates)
  ) {
    return false
  }

  if (
    rates.length !== CURRENCY_RATES.length ||
    !rates.every((rate) => rate && typeof rate === 'object')
  ) {
    return false
  }

  return CURRENCY_RATES.every((definition) => {
    const matches = rates.filter(
      (rate) => rate.currency === definition.currency,
    )
    const rate = matches[0]
    return (
      matches.length === 1 &&
      rate !== undefined &&
      rate.units === definition.units &&
      Number.isSafeInteger(rate.rubTenths) &&
      rate.rubTenths > 0
    )
  })
}

export async function fetchLatestExchangeRates(
  signal?: AbortSignal,
): Promise<ExchangeRateSnapshot> {
  const request: RequestInit = { headers: { Accept: 'application/json' } }
  if (signal !== undefined) request.signal = signal
  const response = await fetch('/api/exchange-rates', request)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const payload: unknown = await response.json()
  if (!isExchangeRateResponse(payload)) {
    throw new Error('Exchange-rate service returned invalid data')
  }

  const snapshot = {
    source: payload.source,
    sourceUrl: payload.sourceUrl,
    effectiveDate: payload.effectiveDate,
    ratesTenths: Object.fromEntries(
      payload.rates.map((rate) => [rate.currency, rate.rubTenths]),
    ) as Record<ForeignCurrency, number>,
  }
  rememberExchangeRateSync()
  return snapshot
}

export async function fetchExchangeRatesIfNeeded(
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<ExchangeRateSnapshot | null> {
  if (getLastExchangeRateSyncDate() === localDateKey(now)) return null
  if (dailyFetchInFlight !== null) return dailyFetchInFlight

  const request = fetchLatestExchangeRates(signal)
  dailyFetchInFlight = request
  try {
    return await request
  } finally {
    if (dailyFetchInFlight === request) dailyFetchInFlight = null
  }
}

export function rateSettingsFrom(
  snapshot: ExchangeRateSnapshot,
): CurrencyRateSettings {
  return Object.fromEntries(
    CURRENCY_RATES.map((definition) => [
      definition.setting,
      snapshot.ratesTenths[definition.currency],
    ]),
  ) as CurrencyRateSettings
}
