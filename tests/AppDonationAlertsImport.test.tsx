import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('App DonationAlerts import', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('persists a pending donation before acknowledging it', async () => {
    let persistedBeforeAcknowledgement = false
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/donations/pending?limit=500') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                source: 'donationalerts',
                sourceId: '190373259',
                username: 'test1',
                amountTenths: 2_000,
                originalAmount: '200',
                currency: 'RUB',
                donatedAt: '2026-09-06 10:20:23',
                fetchedAt: '2026-09-06T10:20:28+00:00',
                isChat: true,
                supportedCurrency: true,
              },
            ],
            count: 1,
          }),
        )
      }
      if (url === '/api/donations/190373259/acknowledge') {
        persistedBeforeAcknowledgement =
          localStorage.getItem('gambalator:state')?.includes('190373259') === true
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (url === '/api/integration/status') {
        return Promise.resolve(
          jsonResponse({
            configured: true,
            connected: true,
            running: true,
            lastPersistedSuccessAt: null,
            lastError: null,
            pendingDonations: 1,
            credentialError: null,
            credentialSource: 'oauth',
            autoChatEnabled: true,
            oauth: {
              applicationConfigured: true,
              apiKeyStored: true,
              connected: true,
              reauthorizationRequired: false,
              clientId: '123',
              redirectUri: 'http://127.0.0.1:5741/api/oauth/callback',
              credentialStorage: 'system-keyring',
              secureCredentialStorage: true,
            },
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByText('test1')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Считать донат test1 как донат от Chat'),
    ).toBeChecked()
    const integration = screen.getByRole('button', { name: /DonationAlerts/ }).closest('section')
    const workspace = document.querySelector('.contributions-panel')
    const settings = screen.getByRole('button', { name: /Параметры расчёта/ }).closest('section')
    if (!integration || !workspace || !settings) {
      throw new Error('Expected all main application sections')
    }
    expect(workspace.querySelector('.count-pills')).not.toBeInTheDocument()
    expect(
      integration.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      workspace.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/donations/190373259/acknowledge',
        { method: 'POST', headers: { Accept: 'application/json' } },
      )
    })
    expect(persistedBeforeAcknowledgement).toBe(true)
  })

  it('acknowledges imported donations sequentially', async () => {
    let releaseFirstAcknowledgement: (response: Response) => void = () => {}
    const firstAcknowledgement = new Promise<Response>((resolve) => {
      releaseFirstAcknowledgement = resolve
    })
    const donation = (sourceId: string) => ({
      source: 'donationalerts',
      sourceId,
      username: `Chel_${sourceId}`,
      amountTenths: 1_000,
      originalAmount: '100',
      currency: 'RUB',
      donatedAt: '2026-09-06 10:20:23',
      fetchedAt: '2026-09-06T10:20:28+00:00',
      isChat: false,
      supportedCurrency: true,
    })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/donations/pending?limit=500') {
        return Promise.resolve(
          jsonResponse({ data: [donation('1'), donation('2')], count: 2 }),
        )
      }
      if (url === '/api/donations/1/acknowledge') return firstAcknowledgement
      if (url === '/api/donations/2/acknowledge') {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (url === '/api/integration/status') {
        return Promise.resolve(
          jsonResponse({
            configured: true,
            connected: true,
            running: true,
            lastPersistedSuccessAt: null,
            lastError: null,
            pendingDonations: 2,
            credentialError: null,
            credentialSource: 'oauth',
            autoChatEnabled: false,
            oauth: {
              applicationConfigured: true,
              apiKeyStored: true,
              connected: true,
              reauthorizationRequired: false,
              clientId: '123',
              redirectUri: 'http://127.0.0.1:5741/api/oauth/callback',
              credentialStorage: 'system-keyring',
              secureCredentialStorage: true,
            },
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByText('Chel_2')).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/donations/1/acknowledge',
        expect.anything(),
      )
    })
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/donations/2/acknowledge',
      expect.anything(),
    )

    releaseFirstAcknowledgement(new Response(null, { status: 204 }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/donations/2/acknowledge',
        expect.anything(),
      )
    })
  })
})
