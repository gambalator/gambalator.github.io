import { describe, expect, it } from 'vitest'
import { calculateRounds } from '../src/domain/calculateRounds'
import type { ContributionEntry, Currency, Settings } from '../src/types'

const settings: Settings = {
  roundTargetTenths: 50_000,
  eurRateTenths: 1_000,
  usdRateTenths: 855,
}

function active(
  id: string,
  nickname: string,
  amountTenths: number,
  currency: Currency = 'RUB',
  isChat = false,
): ContributionEntry {
  return { id, nickname, amountTenths, currency, status: 'active', isChat }
}

function idFactory() {
  let next = 0
  return () => `generated-${++next}`
}

describe('calculateRounds', () => {
  it('matches the reference example', () => {
    const entries = [
      active('1', 'name1', 30_000),
      active('2', 'name2', 10_000),
      active('3', 'name3', 10_000),
      active('4', 'name4', 40_000),
      active('5', 'name5', 10_000),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.completedRounds).toBe(2)
    expect(outcome.newResults.map((result) => result.winner)).toEqual([
      'name1',
      'name4',
    ])
    expect(outcome.entries).toHaveLength(5)
    expect(outcome.entries.every((entry) => entry.status === 'consumed')).toBe(true)
  })

  it('splits overflow and leaves the unfinished remainder active', () => {
    const entries = [
      active('1', 'name1', 40_000),
      active('2', 'nickX', 20_000),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())
    const nickRows = outcome.entries.filter((entry) => entry.nickname === 'nickX')

    expect(outcome.completedRounds).toBe(1)
    expect(nickRows).toHaveLength(2)
    expect(nickRows.map((entry) => [entry.amountTenths, entry.status])).toEqual([
      [10_000, 'consumed'],
      [10_000, 'active'],
    ])
  })

  it('allows one large contribution to win more than one round', () => {
    const entries = [
      active('1', 'other', 5_000),
      active('2', 'nickX', 95_000),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.newResults.map((result) => result.winner)).toEqual([
      'nickX',
      'nickX',
    ])
  })

  it('combines normalized nicknames and lists every nickname in a largest tie', () => {
    const entries = [
      active('1', ' Alex ', 10_000),
      active('2', 'Bob', 20_000),
      active('3', 'alex', 10_000),
      active('4', 'Carol', 10_000),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.newResults[0]).toMatchObject({
      winner: 'Alex, Bob',
      winningRubTenths: 20_000,
    })
  })

  it('aggregates toggled donations under the Chat nickname', () => {
    const entries = [
      active('1', 'Alice', 15_000, 'RUB', true),
      active('2', 'Bob', 20_000),
      active('3', 'Carol', 15_000, 'RUB', true),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.newResults[0]).toMatchObject({
      winner: 'Chat',
      winningRubTenths: 30_000,
    })
  })

  it('does not modify entries when no round can be completed', () => {
    const entries = [active('1', 'name1', 35_000)]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.completedRounds).toBe(0)
    expect(outcome.remainingNeededTenths).toBe(15_000)
    expect(outcome.entries).toBe(entries)
  })

  it('freezes a split foreign-currency entry into exact RUB portions', () => {
    const entries = [active('usd', 'Dollar', 1_000, 'USD')]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.completedRounds).toBe(1)
    expect(outcome.entries.map((entry) => [
      entry.amountTenths,
      entry.currency,
      entry.status,
    ])).toEqual([
      [50_000, 'RUB', 'consumed'],
      [35_500, 'RUB', 'active'],
    ])
    expect(outcome.entries[1]?.sourceReference).toEqual({
      amountTenths: 1_000,
      currency: 'USD',
      rateTenths: 855,
    })
  })

  it('continues numbering from the requested round', () => {
    const outcome = calculateRounds(
      [active('1', 'name1', 50_000)],
      settings,
      7,
      idFactory(),
    )

    expect(outcome.newResults[0]?.roundNumber).toBe(7)
    expect(outcome.entries[0]?.roundNumber).toBe(7)
  })
})
