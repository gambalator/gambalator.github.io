import { describe, expect, it } from 'vitest'
import { calculateRounds } from '../src/domain/calculateRounds'
import { appReducer } from '../src/state'
import {
  DEFAULT_STATE,
  type ContributionEntry,
  type RoundResult,
} from '../src/types'

function entry(id: string): ContributionEntry {
  return {
    id,
    nickname: id,
    amountTenths: 100,
    currency: 'RUB',
    status: 'active',
  }
}

function importedEntry(id: string, donatedAt: string): ContributionEntry {
  return {
    ...entry(`donationalerts:${id}`),
    importReference: {
      provider: 'donationalerts',
      externalId: id,
      donatedAt,
    },
  }
}

describe('appReducer entry order', () => {
  it('updates only exchange rates and preserves primary calculation data', () => {
    const entries = [entry('active')]
    const history: RoundResult[] = [
      {
        id: 'round-1',
        roundNumber: 1,
        winner: 'Winner',
        winningRubTenths: 30_000,
        targetRubTenths: 50_000,
      },
    ]
    const state = {
      ...DEFAULT_STATE,
      entries,
      history,
      settings: { ...DEFAULT_STATE.settings, roundTargetTenths: 75_000 },
    }

    const updated = appReducer(state, {
      type: 'settings/rates-update',
      rates: {
        eurRateTenths: 923,
        usdRateTenths: 785,
        bynRateTenths: 271,
        kztRateTenths: 157,
        uahRateTenths: 175,
        brlRateTenths: 155,
        tryRateTenths: 180,
        plnRateTenths: 232,
        uzsRateTenths: 731,
      },
    })

    expect(updated.settings).toEqual({
      roundTargetTenths: 75_000,
      eurRateTenths: 923,
      usdRateTenths: 785,
      bynRateTenths: 271,
      kztRateTenths: 157,
      uahRateTenths: 175,
      brlRateTenths: 155,
      tryRateTenths: 180,
      plnRateTenths: 232,
      uzsRateTenths: 731,
    })
    expect(updated.entries).toBe(entries)
    expect(updated.history).toBe(history)
  })

  it('keeps the canonical calculation order chronological', () => {
    const state = {
      ...DEFAULT_STATE,
      entries: [entry('older')],
    }

    const updated = appReducer(state, {
      type: 'entry/add',
      entry: entry('newer'),
    })

    expect(updated.entries.map((item) => item.id)).toEqual(['older', 'newer'])
  })

  it('accepts a complete active order so grouped entries can move as a block', () => {
    const consumed: ContributionEntry = {
      ...entry('used'),
      status: 'consumed',
      roundNumber: 1,
      frozenRubTenths: 100,
    }
    const state = {
      ...DEFAULT_STATE,
      entries: [consumed, entry('a'), entry('b'), entry('c'), entry('d')],
    }

    const updated = appReducer(state, {
      type: 'entries/reorder',
      activeIds: ['a', 'd', 'b', 'c'],
    })

    expect(updated.entries.map((item) => item.id)).toEqual([
      'used',
      'a',
      'd',
      'b',
      'c',
    ])
  })

  it('uses a moved group block order for calculation without combining nicknames', () => {
    const state = {
      ...DEFAULT_STATE,
      entries: [
        { ...entry('alice'), nickname: 'Alice', amountTenths: 30_000 },
        { ...entry('bob'), nickname: 'Bob', amountTenths: 20_000 },
        { ...entry('carol'), nickname: 'Carol', amountTenths: 50_000 },
      ],
    }
    const reordered = appReducer(state, {
      type: 'entries/reorder',
      activeIds: ['carol', 'alice', 'bob'],
    })
    let nextId = 0

    const outcome = calculateRounds(
      reordered.entries,
      reordered.settings,
      1,
      () => `calculated-${++nextId}`,
    )

    expect(outcome.newResults.map((result) => result.winner)).toEqual([
      'Carol',
      'Alice',
    ])
  })

  it('preserves Chat attribution when a Chat group block changes the closer', () => {
    const state = {
      ...DEFAULT_STATE,
      entries: [
        { ...entry('regular'), nickname: 'Regular', amountTenths: 49_000 },
        {
          ...entry('chat-1'),
          nickname: 'Viewer one',
          amountTenths: 500,
          isChat: true,
        },
        {
          ...entry('chat-2'),
          nickname: 'Viewer two',
          amountTenths: 500,
          isChat: true,
        },
      ],
    }
    const reordered = appReducer(state, {
      type: 'entries/reorder',
      activeIds: ['chat-1', 'chat-2', 'regular'],
    })
    let nextId = 0

    const outcome = calculateRounds(
      reordered.entries,
      reordered.settings,
      1,
      () => `calculated-${++nextId}`,
    )

    expect(outcome.newResults[0]).toMatchObject({
      winner: 'Regular',
      winningRubTenths: 49_000,
      isChatWinner: false,
    })
  })

  it('rejects an incomplete block order without losing active entries', () => {
    const state = {
      ...DEFAULT_STATE,
      entries: [entry('a'), entry('b'), entry('c')],
    }

    const unchanged = appReducer(state, {
      type: 'entries/reorder',
      activeIds: ['a', 'b'],
    })

    expect(unchanged).toBe(state)
  })

  it('removes every active entry represented by a visual group', () => {
    const state = {
      ...DEFAULT_STATE,
      entries: [entry('a'), entry('b'), entry('c')],
    }

    const updated = appReducer(state, {
      type: 'entries/remove',
      ids: ['a', 'b'],
    })

    expect(updated.entries.map((item) => item.id)).toEqual(['c'])
  })

  it('clears completed-round history without removing active donations', () => {
    const active = entry('active')
    const consumed = {
      ...entry('consumed'),
      status: 'consumed' as const,
      roundNumber: 1,
    }
    const state = {
      ...DEFAULT_STATE,
      entries: [consumed, active],
      history: [{
        id: 'round-1',
        roundNumber: 1,
        winner: 'Winner',
        winningRubTenths: 50_000,
        targetRubTenths: 50_000,
      }],
    }

    const updated = appReducer(state, { type: 'round-history/clear' })

    expect(updated.entries).toEqual([active])
    expect(updated.history).toEqual([])
  })

  it('imports external entries once and keeps chronological order', () => {
    const imported: ContributionEntry = {
      ...entry('donationalerts:10'),
      importReference: {
        provider: 'donationalerts',
        externalId: '10',
        donatedAt: '2026-09-06 12:00:00',
      },
    }
    const state = { ...DEFAULT_STATE, entries: [entry('manual')] }

    const first = appReducer(state, {
      type: 'entries/import',
      entries: [imported],
    })
    const duplicate = appReducer(first, {
      type: 'entries/import',
      entries: [{ ...imported, id: 'another-id' }],
    })

    expect(first.entries.map((item) => item.id)).toEqual([
      'manual',
      'donationalerts:10',
    ])
    expect(duplicate).toBe(first)
  })

  it('restores older donations to their chronological calculation positions', () => {
    const state = {
      ...DEFAULT_STATE,
      entries: [
        importedEntry('4', '2026-09-06 12:04:00'),
        importedEntry('5', '2026-09-06 12:05:00'),
      ],
    }

    const restored = appReducer(state, {
      type: 'entries/import',
      entries: [
        importedEntry('1', '2026-09-06 12:01:00'),
        importedEntry('2', '2026-09-06 12:02:00'),
        importedEntry('3', '2026-09-06 12:03:00'),
      ],
    })

    expect(
      restored.entries.map((item) => item.importReference?.externalId),
    ).toEqual(['1', '2', '3', '4', '5'])
  })

  it('uses the DonationAlerts ID to order donations with equal timestamps', () => {
    const donatedAt = '2026-09-06 12:00:00'
    const state = {
      ...DEFAULT_STATE,
      entries: [importedEntry('12', donatedAt)],
    }

    const restored = appReducer(state, {
      type: 'entries/import',
      entries: [importedEntry('9', donatedAt), importedEntry('10', donatedAt)],
    })

    expect(
      restored.entries.map((item) => item.importReference?.externalId),
    ).toEqual(['9', '10', '12'])
  })

  it('does not reorder existing manual entries while restoring donations', () => {
    const state = {
      ...DEFAULT_STATE,
      entries: [
        importedEntry('1', '2026-09-06 12:01:00'),
        entry('manual-a'),
        importedEntry('3', '2026-09-06 12:03:00'),
        entry('manual-b'),
      ],
    }

    const restored = appReducer(state, {
      type: 'entries/import',
      entries: [importedEntry('2', '2026-09-06 12:02:00')],
    })

    expect(restored.entries.map((item) => item.id)).toEqual([
      'donationalerts:1',
      'manual-a',
      'donationalerts:2',
      'donationalerts:3',
      'manual-b',
    ])
  })

  it('marks previous winners pale when new results are applied', () => {
    const previous: RoundResult = {
      id: 'round-1',
      roundNumber: 1,
      winner: 'OlderWinner',
      winningRubTenths: 30_000,
      targetRubTenths: 50_000,
      isLatest: true,
    }
    const next: RoundResult = {
      id: 'round-2',
      roundNumber: 2,
      winner: 'NewWinner',
      winningRubTenths: 40_000,
      targetRubTenths: 50_000,
    }

    const updated = appReducer(
      { ...DEFAULT_STATE, history: [previous] },
      { type: 'calculation/apply', entries: [], results: [next] },
    )

    expect(updated.history).toEqual([
      { ...previous, isLatest: false },
      { ...next, isLatest: true },
    ])
  })
})
