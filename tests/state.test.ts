import { describe, expect, it } from 'vitest'
import { appReducer } from '../src/state'
import { DEFAULT_STATE, type ContributionEntry } from '../src/types'

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
})
