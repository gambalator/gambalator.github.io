import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function exchangeRateResponse(): Response {
  return jsonResponse({
    source: 'Банк России',
    sourceUrl: 'https://www.cbr.ru/scripts/XML_daily.asp',
    effectiveDate: '2026-09-08',
    rates: [
      { currency: 'EUR', units: 1, rubTenths: 923 },
      { currency: 'USD', units: 1, rubTenths: 785 },
      { currency: 'BYN', units: 1, rubTenths: 271 },
      { currency: 'KZT', units: 100, rubTenths: 157 },
      { currency: 'UAH', units: 10, rubTenths: 175 },
      { currency: 'BRL', units: 1, rubTenths: 155 },
      { currency: 'TRY', units: 10, rubTenths: 180 },
      { currency: 'PLN', units: 1, rubTenths: 232 },
      { currency: 'UZS', units: 10_000, rubTenths: 731 },
    ],
  })
}

function disconnectedStatusResponse(): Response {
  return jsonResponse({
    configured: false,
    connected: false,
    running: false,
    lastPersistedSuccessAt: null,
    lastError: null,
    pendingDonations: 1,
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

  it('persists and acknowledges a foreign donation without waiting for rates', async () => {
    let rejectRateRequest: (reason?: unknown) => void = () => {}
    const rateRequest = new Promise<Response>((_resolve, reject) => {
      rejectRateRequest = reject
    })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/donations/pending?limit=500') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                source: 'donationalerts',
                sourceId: 'foreign-1',
                username: 'ForeignDonor',
                amountTenths: 100,
                originalAmount: '10',
                currency: 'USD',
                donatedAt: '2026-09-08 10:20:23',
                fetchedAt: '2026-09-08T10:20:28+00:00',
                isChat: false,
                supportedCurrency: true,
              },
            ],
            count: 1,
          }),
        )
      }
      if (url === '/api/exchange-rates') return rateRequest
      if (url === '/api/donations/foreign-1/acknowledge') {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (url === '/api/integration/status') {
        return Promise.resolve(
          jsonResponse({
            configured: false,
            connected: false,
            running: false,
            lastPersistedSuccessAt: null,
            lastError: null,
            pendingDonations: 1,
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
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByText('ForeignDonor')).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/donations/foreign-1/acknowledge',
        expect.anything(),
      )
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/exchange-rates',
      expect.anything(),
    )
    expect(localStorage.getItem('gambalator:state')).toContain('foreign-1')

    rejectRateRequest(new TypeError('CBR unavailable'))
    await Promise.resolve()
  })

  it('applies a successful background refresh without changing the donation', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/donations/pending?limit=500') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                source: 'donationalerts',
                sourceId: 'foreign-2',
                username: 'EuroDonor',
                amountTenths: 100,
                originalAmount: '10',
                currency: 'EUR',
                donatedAt: '2026-09-08 10:20:23',
                fetchedAt: '2026-09-08T10:20:28+00:00',
                isChat: false,
                supportedCurrency: true,
              },
            ],
            count: 1,
          }),
        )
      }
      if (url === '/api/exchange-rates') {
        return Promise.resolve(exchangeRateResponse())
      }
      if (url === '/api/donations/foreign-2/acknowledge') {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (url === '/api/integration/status') {
        return Promise.resolve(
          jsonResponse({
            configured: false,
            connected: false,
            running: false,
            lastPersistedSuccessAt: null,
            lastError: null,
            pendingDonations: 1,
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
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByText('EuroDonor')).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /USD 78\.5/ }),
      ).toBeInTheDocument()
    })

    const stored = JSON.parse(
      localStorage.getItem('gambalator:state') ?? 'null',
    ) as { state: { entries: Array<Record<string, unknown>> } }
    expect(stored.state.entries).toEqual([
      expect.objectContaining({
        id: 'donationalerts:foreign-2',
        amountTenths: 100,
        currency: 'EUR',
        status: 'active',
      }),
    ])
  })

  it('does not replace rates saved by the operator during a background request', async () => {
    const user = userEvent.setup()
    let resolveRateRequest: (response: Response) => void = () => {}
    const rateRequest = new Promise<Response>((resolve) => {
      resolveRateRequest = resolve
    })
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/donations/pending?limit=500') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                source: 'donationalerts',
                sourceId: 'foreign-3',
                username: 'ManualRateDonor',
                amountTenths: 100,
                originalAmount: '10',
                currency: 'USD',
                donatedAt: '2026-09-08 10:20:23',
                fetchedAt: '2026-09-08T10:20:28+00:00',
                isChat: false,
                supportedCurrency: true,
              },
            ],
            count: 1,
          }),
        )
      }
      if (url === '/api/exchange-rates') return rateRequest
      if (url === '/api/donations/foreign-3/acknowledge') {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (url === '/api/integration/status') {
        return Promise.resolve(disconnectedStatusResponse())
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByText('ManualRateDonor')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Параметры расчёта/ }))
    const usdRate = screen.getByLabelText('Курс USD')
    await user.clear(usdRate)
    await user.type(usdRate, '90.0')
    await user.click(screen.getByRole('button', { name: 'Сохранить курсы' }))

    resolveRateRequest(exchangeRateResponse())
    await waitFor(() => {
      expect(
        localStorage.getItem('gambalator:exchange-rates:last-sync-date'),
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
    expect(
      screen.getByRole('button', { name: /USD 90\.0/ }),
    ).toBeInTheDocument()
  })
})
