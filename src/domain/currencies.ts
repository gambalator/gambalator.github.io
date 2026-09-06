import type { Currency, Settings } from '../types'

export type ForeignCurrency = Exclude<Currency, 'RUB'>
export type RateSetting = Exclude<keyof Settings, 'roundTargetTenths'>

export interface CurrencyRateDefinition {
  currency: ForeignCurrency
  units: number
  setting: RateSetting
}

export const CURRENCIES: readonly Currency[] = [
  'RUB',
  'USD',
  'EUR',
  'BYN',
  'KZT',
  'UAH',
  'BRL',
  'TRY',
]

export const PRIMARY_CURRENCY_RATES: readonly CurrencyRateDefinition[] = [
  { currency: 'EUR', units: 1, setting: 'eurRateTenths' },
  { currency: 'USD', units: 1, setting: 'usdRateTenths' },
]

export const ADDITIONAL_CURRENCY_RATES: readonly CurrencyRateDefinition[] = [
  { currency: 'BYN', units: 1, setting: 'bynRateTenths' },
  { currency: 'KZT', units: 100, setting: 'kztRateTenths' },
  { currency: 'UAH', units: 10, setting: 'uahRateTenths' },
  { currency: 'BRL', units: 1, setting: 'brlRateTenths' },
  { currency: 'TRY', units: 10, setting: 'tryRateTenths' },
]

export const CURRENCY_RATES: readonly CurrencyRateDefinition[] = [
  ...PRIMARY_CURRENCY_RATES,
  ...ADDITIONAL_CURRENCY_RATES,
]

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && CURRENCIES.includes(value as Currency)
}

export function rateDefinition(currency: ForeignCurrency): CurrencyRateDefinition {
  const definition = CURRENCY_RATES.find((item) => item.currency === currency)
  if (!definition) throw new RangeError(`Unsupported currency: ${currency}`)
  return definition
}
