import { beforeEach, describe, expect, it } from 'vitest'
import { loadState, saveState } from '../src/storage/localStorage'
import { DEFAULT_STATE, type AppState } from '../src/types'

describe('local storage adapter', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips valid state', () => {
    const state: AppState = {
      ...DEFAULT_STATE,
      entries: [
        {
          id: '1',
          nickname: 'Alex',
          amountTenths: 10_000,
          currency: 'RUB',
          status: 'active',
        },
      ],
    }

    expect(saveState(state)).toBe(true)
    expect(loadState().state).toEqual(state)
  })

  it('falls back safely when persisted JSON is invalid', () => {
    localStorage.setItem('gambalator:state', '{not json')

    const loaded = loadState()

    expect(loaded.state).toEqual(DEFAULT_STATE)
    expect(loaded.warning).toBeTruthy()
  })

  it('preserves chronological rows when migrating version 1 data', () => {
    const oldState: AppState = {
      ...DEFAULT_STATE,
      entries: [
        {
          id: 'older',
          nickname: 'Older',
          amountTenths: 100,
          currency: 'RUB',
          status: 'active',
        },
        {
          id: 'newer',
          nickname: 'Newer',
          amountTenths: 200,
          currency: 'RUB',
          status: 'active',
        },
      ],
    }
    localStorage.setItem(
      'gambalator:state',
      JSON.stringify({ version: 1, state: oldState }),
    )

    expect(loadState().state.entries.map((item) => item.id)).toEqual([
      'older',
      'newer',
    ])
  })

  it('repairs active rows reversed by the temporary version 2 behavior', () => {
    const versionTwoState: AppState = {
      ...DEFAULT_STATE,
      entries: [
        {
          id: 'newer',
          nickname: 'Newer',
          amountTenths: 200,
          currency: 'RUB',
          status: 'active',
        },
        {
          id: 'older',
          nickname: 'Older',
          amountTenths: 100,
          currency: 'RUB',
          status: 'active',
        },
      ],
    }
    localStorage.setItem(
      'gambalator:state',
      JSON.stringify({ version: 2, state: versionTwoState }),
    )

    expect(loadState().state.entries.map((item) => item.id)).toEqual([
      'older',
      'newer',
    ])
  })
})
