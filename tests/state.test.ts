import { describe, expect, it } from 'vitest'
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
