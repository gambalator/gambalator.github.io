import { describe, expect, it } from 'vitest'
import { calculateRounds } from '../src/domain/calculateRounds'
import {
  DEFAULT_SETTINGS,
  type ContributionEntry,
  type Currency,
  type Settings,
} from '../src/types'

const settings: Settings = {
  ...DEFAULT_SETTINGS,
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
  it('can limit a calculation to one complete round', () => {
    const entries = [
      active('1', 'first', 50_000),
      active('2', 'second', 50_000),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory(), 1)

    expect(outcome.completedRounds).toBe(1)
    expect(outcome.newResults.map((result) => result.winner)).toEqual(['first'])
    expect(
      outcome.entries
        .filter((entry) => entry.status === 'active')
        .map((entry) => entry.nickname),
    ).toEqual(['second'])
  })

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
    expect(nickRows.every((entry) => (
      entry.sourceReference?.amountTenths === 20_000 &&
      entry.sourceReference.currency === 'RUB'
    ))).toBe(true)
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
    const splitRows = outcome.entries.filter((entry) => entry.nickname === 'nickX')
    expect(splitRows).toHaveLength(2)
    expect(splitRows.every((entry) => (
      entry.sourceReference?.amountTenths === 95_000 &&
      entry.sourceReference.currency === 'RUB'
    ))).toBe(true)
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

  it('aggregates Chat donations when a Chat donation closes the round', () => {
    const entries = [
      active('1', 'Alice', 15_000, 'RUB', true),
      active('2', 'Bob', 20_000),
      active('3', 'Carol', 15_000, 'RUB', true),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.newResults[0]).toMatchObject({
      winner: 'Chat',
      winningRubTenths: 30_000,
      isChatWinner: true,
    })
  })

  it('excludes Chat donations when a regular donation closes the round', () => {
    const entries = [
      active('1', 'Chat donor', 35_000, 'RUB', true),
      active('2', 'Smaller', 5_000),
      active('3', 'Winner', 10_000),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.newResults[0]).toMatchObject({
      winner: 'Winner',
      winningRubTenths: 10_000,
      isChatWinner: false,
    })
  })

  it('forces Chat to win when a Chat donation closes the round', () => {
    const entries = [
      active('1', 'Largest regular donor', 30_000),
      active('2', 'Other regular donor', 19_000),
      active('3', 'Closing Chat donor', 1_000, 'RUB', true),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.newResults[0]).toMatchObject({
      winner: 'Chat',
      winningRubTenths: 1_000,
      isChatWinner: true,
    })
  })

  it('keeps regular ties after excluding Chat donations', () => {
    const entries = [
      active('1', 'Chat donor', 20_000, 'RUB', true),
      active('2', 'Alice', 15_000),
      active('3', 'Bob', 15_000),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.newResults[0]).toMatchObject({
      winner: 'Alice, Bob',
      winningRubTenths: 15_000,
      isChatWinner: false,
    })
  })

  it('decides Chat mode separately at every split round boundary', () => {
    const entries = [
      active('1', 'Chat donor', 60_000, 'RUB', true),
      active('2', 'Regular closer', 40_000),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.newResults).toMatchObject([
      {
        winner: 'Chat',
        winningRubTenths: 50_000,
        isChatWinner: true,
      },
      {
        winner: 'Regular closer',
        winningRubTenths: 40_000,
        isChatWinner: false,
      },
    ])
  })

  it('does not merge a regular nickname Chat with Chat-attributed donations', () => {
    const entries = [
      active('1', 'Marked donor', 40_000, 'RUB', true),
      active('2', 'Chat', 10_000),
    ]

    const outcome = calculateRounds(entries, settings, 1, idFactory())

    expect(outcome.newResults[0]).toMatchObject({
      winner: 'Chat',
      winningRubTenths: 10_000,
      isChatWinner: false,
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
    const importedEntry: ContributionEntry = {
      ...active('usd', 'Dollar', 1_000, 'USD'),
      importReference: {
        provider: 'donationalerts',
        externalId: '42',
        donatedAt: '2026-09-06 12:00:00',
      },
    }
    const entries = [importedEntry]

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
      rateUnits: 1,
    })
    expect(outcome.entries.every((entry) => (
      entry.importReference?.externalId === '42'
    ))).toBe(true)
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
