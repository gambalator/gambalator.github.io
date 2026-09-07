import { describe, expect, it } from 'vitest'
import { convertToRubTenths, formatTenths, parseTenths } from '../src/domain/money'
import { DEFAULT_SETTINGS } from '../src/types'

describe('money helpers', () => {
  it('parses period and comma decimal separators', () => {
    expect(parseTenths('85.5')).toBe(855)
    expect(parseTenths('85,5')).toBe(855)
    expect(parseTenths('85')).toBe(850)
  })

  it('rejects invalid or over-precise input', () => {
    expect(parseTenths('0.01')).toBeNull()
    expect(parseTenths('-1.0')).toBeNull()
    expect(parseTenths('hello')).toBeNull()
  })

  it('formats exactly one decimal place', () => {
    expect(formatTenths(50_000)).toBe('5000.0')
  })

  it('rounds conversion to one tenth of a RUB', () => {
    expect(
      convertToRubTenths(101, 'USD', {
        ...DEFAULT_SETTINGS,
      }),
    ).toBe(8_636)
  })

  it('converts currencies quoted in lots without losing one-decimal precision', () => {
    expect(convertToRubTenths(1_000, 'KZT', DEFAULT_SETTINGS)).toBe(190)
    expect(convertToRubTenths(100, 'UAH', DEFAULT_SETTINGS)).toBe(194)
    expect(convertToRubTenths(100, 'TRY', DEFAULT_SETTINGS)).toBe(179)
    expect(convertToRubTenths(10, 'PLN', DEFAULT_SETTINGS)).toBe(232)
    expect(convertToRubTenths(100_000, 'UZS', DEFAULT_SETTINGS)).toBe(731)
  })
})
