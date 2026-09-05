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
