import { describe, expect, it } from 'vitest'
import {
  displayMoscowTime,
  displayDonationMoscowTime,
  moscowDateTimeLocalValue,
  parseMoscowDateTimeLocal,
  startOfMoscowDayValue,
} from '../src/domain/moscowTime'

describe('Moscow time helpers', () => {
  it('formats UTC instants as fixed Moscow time', () => {
    const instant = new Date('2026-09-06T10:20:00Z')

    expect(moscowDateTimeLocalValue(instant)).toBe('2026-09-06T13:20')
    expect(displayMoscowTime(instant.toISOString())).toContain('13:20')
    expect(displayMoscowTime(instant.toISOString())).toContain('МСК')
    expect(displayDonationMoscowTime('2026-09-06 10:20:00')).toContain('13:20')
  })

  it('parses a Moscow date-time selection as UTC', () => {
    expect(parseMoscowDateTimeLocal('2026-09-06T13:20')?.toISOString()).toBe(
      '2026-09-06T10:20:00.000Z',
    )
    expect(parseMoscowDateTimeLocal('2026-02-30T13:20')).toBeNull()
  })

  it('selects midnight of the current Moscow day', () => {
    expect(startOfMoscowDayValue(new Date('2026-09-06T22:30:00Z'))).toBe(
      '2026-09-07T00:00',
    )
  })
})
