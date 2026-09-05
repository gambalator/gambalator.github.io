import { describe, expect, it } from 'vitest'
import { convertToRubTenths, formatTenths, parseTenths } from '../src/domain/money'

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
        roundTargetTenths: 50_000,
        eurRateTenths: 1_000,
        usdRateTenths: 855,
      }),
    ).toBe(8_636)
  })
})

