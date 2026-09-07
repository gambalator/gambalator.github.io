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
          isChat: true,
          amountTenths: 10_000,
          currency: 'RUB',
          status: 'active',
          importReference: {
            provider: 'donationalerts',
            externalId: '190373259',
            donatedAt: '2026-09-06 10:20:23',
          },
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

  it('loads version 3 data with Chat attribution disabled by default', () => {
    const versionThreeState: AppState = {
      ...DEFAULT_STATE,
      entries: [
        {
          id: 'existing',
          nickname: 'ExistingViewer',
          amountTenths: 500,
          currency: 'RUB',
          status: 'active',
        },
      ],
    }
    localStorage.setItem(
      'gambalator:state',
      JSON.stringify({ version: 3, state: versionThreeState }),
    )

    expect(loadState().state).toEqual(versionThreeState)
    expect(loadState().state.entries[0]?.isChat).toBeUndefined()
  })

  it('loads existing version 4 data without losing it', () => {
    const versionFourState: AppState = {
      ...DEFAULT_STATE,
      entries: [
        {
          id: 'existing',
          nickname: 'Chel_4',
          amountTenths: 500,
          currency: 'RUB',
          status: 'active',
        },
      ],
    }
    localStorage.setItem(
      'gambalator:state',
      JSON.stringify({ version: 4, state: versionFourState }),
    )

    expect(loadState().state).toEqual(versionFourState)
  })

  it('adds default DonationAlerts currency rates to version 5 data', () => {
    localStorage.setItem(
      'gambalator:state',
      JSON.stringify({
        version: 5,
        state: {
          settings: {
            roundTargetTenths: 50_000,
            eurRateTenths: 1_000,
            usdRateTenths: 855,
          },
          entries: [],
          history: [],
        },
      }),
    )

    expect(loadState().state.settings).toEqual(DEFAULT_STATE.settings)
  })

  it('adds PLN and UZS rates to version 6 data without losing saved data', () => {
    const settings = {
      roundTargetTenths: 75_000,
      eurRateTenths: 923,
      usdRateTenths: 785,
      bynRateTenths: 271,
      kztRateTenths: 157,
      uahRateTenths: 175,
      brlRateTenths: 155,
      tryRateTenths: 180,
    }
    const entry = {
      id: 'existing',
      nickname: 'SavedDonor',
      amountTenths: 1_000,
      currency: 'RUB',
      status: 'active',
    }
    localStorage.setItem(
      'gambalator:state',
      JSON.stringify({
        version: 6,
        state: { settings, entries: [entry], history: [] },
      }),
    )

    const loaded = loadState()

    expect(loaded.warning).toBeUndefined()
    expect(loaded.state.entries).toEqual([entry])
    expect(loaded.state.settings).toEqual({
      ...settings,
      plnRateTenths: DEFAULT_STATE.settings.plnRateTenths,
      uzsRateTenths: DEFAULT_STATE.settings.uzsRateTenths,
    })
  })
})
