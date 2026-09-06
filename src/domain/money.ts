import type { Currency, Settings } from '../types'
import { rateDefinition } from './currencies'

const ONE_DECIMAL_NUMBER = /^\d+(?:[.,]\d)?$/

export function parseTenths(value: string): number | null {
  const normalized = value.trim()
  if (!ONE_DECIMAL_NUMBER.test(normalized)) return null

  const [whole = '0', fraction = '0'] = normalized.replace(',', '.').split('.')
  const tenths = Number(whole) * 10 + Number(fraction)

  return Number.isSafeInteger(tenths) ? tenths : null
}

export function formatTenths(value: number): string {
  return (value / 10).toFixed(1)
}

export function normalizeNickname(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU')
}

export function rateFor(currency: Currency, settings: Settings): number {
  if (currency === 'RUB') return 10
  return settings[rateDefinition(currency).setting]
}

export function rateUnitsFor(currency: Currency): number {
  return currency === 'RUB' ? 1 : rateDefinition(currency).units
}

export function convertToRubTenths(
  amountTenths: number,
  currency: Currency,
  settings: Settings,
): number {
  if (currency === 'RUB') return amountTenths

  const product = amountTenths * rateFor(currency, settings)
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('Money value is too large to calculate safely')
  }

  return Math.round(product / (rateUnitsFor(currency) * 10))
}
