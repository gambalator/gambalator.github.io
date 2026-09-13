import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { saveState } from '../src/storage/localStorage'
import { DEFAULT_STATE, type AppState } from '../src/types'

function jsonResponse(payload: object): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function integrationStatus(): Response {
  return jsonResponse({
    configured: false,
    connected: false,
    running: false,
    lastPersistedSuccessAt: null,
    lastError: null,
    pendingDonations: 0,
    credentialError: null,
    credentialSource: 'oauth',
    autoChatEnabled: false,
    oauth: {
      applicationConfigured: false,
      apiKeyStored: false,
      connected: false,
      reauthorizationRequired: false,
      clientId: null,
      redirectUri: 'http://127.0.0.1:5741/api/oauth/callback',
      credentialStorage: 'file',
      secureCredentialStorage: false,
    },
  })
}

describe('App backend calculator state', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('loads authoritative entries without reading them from localStorage', async () => {
    const state: AppState = {
      ...DEFAULT_STATE,
      entries: [{
        id: 'donationalerts:1',
        nickname: 'BackendDonor',
        amountTenths: 50_000,
        currency: 'RUB',
        status: 'active',
      }],
    }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/calculator/state') {
        return Promise.resolve(jsonResponse({ state, revision: 1 }))
      }
      if (url === '/api/integration/status') {
        return Promise.resolve(integrationStatus())
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    }))

    render(<App />)

    expect(await screen.findByText('BackendDonor')).toBeInTheDocument()
    expect(localStorage.getItem('gambalator:state')).toBeNull()
  })

  it('keeps localStorage as the standalone static-mode fallback', async () => {
    const staticState: AppState = {
      ...DEFAULT_STATE,
      entries: [{
        id: 'manual-1',
        nickname: 'StaticDonor',
        amountTenths: 1_000,
        currency: 'RUB',
        status: 'active',
      }],
    }
    expect(saveState(staticState)).toBe(true)
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('No backend'))))

    render(<App />)

    expect(await screen.findByText('StaticDonor')).toBeInTheDocument()
  })

  it('uses the one-round backend action and renders its returned result', async () => {
    const user = userEvent.setup()
    const initial: AppState = {
      ...DEFAULT_STATE,
      entries: [
        { id: '1', nickname: 'First', amountTenths: 50_000, currency: 'RUB', status: 'active' },
        { id: '2', nickname: 'Second', amountTenths: 50_000, currency: 'RUB', status: 'active' },
      ],
    }
    const calculated: AppState = {
      ...initial,
      entries: [
        { ...initial.entries[0]!, status: 'consumed', roundNumber: 1 },
        initial.entries[1]!,
      ],
      history: [{
        id: 'round-1',
        roundNumber: 1,
        winner: 'First',
        winningRubTenths: 50_000,
        targetRubTenths: 50_000,
        isLatest: true,
      }],
    }
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init
      const url = String(input)
      if (url === '/api/calculator/state') {
        return Promise.resolve(jsonResponse({ state: initial, revision: 1 }))
      }
      if (url === '/api/calculator/actions') {
        return Promise.resolve(jsonResponse({
          state: calculated,
          revision: 2,
          calculation: { completedRounds: 1, remainingNeededTenths: 50_000 },
        }))
      }
      if (url === '/api/integration/status') return Promise.resolve(integrationStatus())
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByText('Second')
    await user.click(screen.getByRole('button', { name: 'Рассчитать один' }))

    await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument())
    const actionCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/calculator/actions')
    expect(actionCall?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ type: 'calculation/run', maxRounds: 1 }),
    })
  })
})
