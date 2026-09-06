import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DonationAlertsPanel } from '../src/components/DonationAlertsPanel'

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const connectedStatus = {
  configured: true,
  connected: true,
  running: true,
  lastPersistedSuccessAt: '2026-09-06T12:00:00+00:00',
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
}

const disconnectedStatus = {
  ...connectedStatus,
  configured: false,
  connected: false,
  running: false,
  oauth: {
    ...connectedStatus.oauth,
    applicationConfigured: false,
    apiKeyStored: false,
    connected: false,
    reauthorizationRequired: false,
    clientId: null,
  },
}

const savedButDisconnectedStatus = {
  ...disconnectedStatus,
  configured: true,
  oauth: {
    ...disconnectedStatus.oauth,
    applicationConfigured: true,
    apiKeyStored: true,
    clientId: '123',
  },
}

const reauthorizationStatus = {
  ...connectedStatus,
  connected: false,
  lastError: 'DonationAlerts refresh token was rejected',
  oauth: {
    ...connectedStatus.oauth,
    connected: false,
    reauthorizationRequired: true,
  },
}

describe('DonationAlertsPanel', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('hides the successful authorization notice after five seconds', () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '/?donationalerts=connected')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(connectedStatus)))

    render(<DonationAlertsPanel />)

    expect(screen.getByText('DonationAlerts успешно подключён.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4_999))
    expect(screen.getByText('DonationAlerts успешно подключён.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('DonationAlerts успешно подключён.')).not.toBeInTheDocument()
  })

  it('shows local backend connection details without exposing credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(connectedStatus)))
    const user = userEvent.setup()
    render(<DonationAlertsPanel />)

    expect(await screen.findByText('Подключено')).toBeInTheDocument()
    const connectionMap = screen.getByLabelText('Состояние подключений')
    expect(within(connectionMap).getByText('Веб-страница')).toBeInTheDocument()
    expect(within(connectionMap).getByText('Локальный сервер')).toBeInTheDocument()
    expect(within(connectionMap).getByText('DonationAlerts')).toBeInTheDocument()
    expect(within(connectionMap).getByText('Связь есть')).toBeInTheDocument()
    expect(within(connectionMap).getByText('Синхронизация активна')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /DonationAlerts/ }))

    expect(screen.getByText('Ожидают импорта: 2')).toBeInTheDocument()
    expect(screen.getByText('системное хранилище')).toBeInTheDocument()
    expect(screen.queryByText(/API Key/)).not.toBeInTheDocument()
  })

  it('updates automatic Chat attribution for new DonationAlerts donations', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/integration/status') {
        return Promise.resolve(jsonResponse(connectedStatus))
      }
      if (url === '/api/settings/auto-chat' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse({ enabled: true }))
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<DonationAlertsPanel />)

    expect(await screen.findByText('Подключено')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /DonationAlerts/ }))
    const toggle = screen.getByLabelText(
      'Включить Авто-Chat для новых донатов DonationAlerts',
    )
    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    await waitFor(() => expect(toggle).toBeChecked())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/auto-chat',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
      }),
    )
  })

  it('explains that automatic import needs the local server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const user = userEvent.setup()
    render(<DonationAlertsPanel />)

    expect(await screen.findByText('Локальный сервер недоступен')).toBeInTheDocument()
    const connectionMap = screen.getByLabelText('Состояние подключений')
    expect(within(connectionMap).getByText('Нет связи')).toBeInTheDocument()
    expect(within(connectionMap).getByText('Недоступно')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /DonationAlerts/ }))

    expect(screen.getByText(/mise run local/)).toBeInTheDocument()
  })

  it('uses the credential names shown by DonationAlerts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(disconnectedStatus)))
    const user = userEvent.setup()
    render(<DonationAlertsPanel />)

    expect(await screen.findByText('Не подключено')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /DonationAlerts/ }))

    expect(screen.getByLabelText('App ID')).toBeInTheDocument()
    expect(screen.getByLabelText('API Key')).toBeInTheDocument()
  })

  it('shows that the API Key remains saved after disconnecting without exposing it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(savedButDisconnectedStatus)),
    )
    const user = userEvent.setup()
    render(<DonationAlertsPanel />)

    expect(await screen.findByText('Не подключено')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /DonationAlerts/ }))

    const apiKeyInput = screen.getByLabelText('API Key')
    expect(apiKeyInput).toHaveValue('')
    expect(apiKeyInput).toHaveAttribute('placeholder', '••••••••••••')
    expect(screen.getByText(/API Key сохранён/)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('very-secret')
  })

  it('offers one-click authorization when the saved refresh token is rejected', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/integration/status') {
        return Promise.resolve(jsonResponse(reauthorizationStatus))
      }
      if (url === '/api/integration/oauth/start') {
        return Promise.resolve(jsonResponse({ error: 'test authorization stop' }, 503))
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<DonationAlertsPanel />)

    expect(
      await screen.findByText('Требуется повторная авторизация'),
    ).toBeInTheDocument()
    expect(screen.getByText('Нужна авторизация')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /DonationAlerts/ }))

    await user.click(
      screen.getByRole('button', { name: 'ПЕРЕПОДКЛЮЧИТЬ DONATIONALERTS' }),
    )
    expect(await screen.findByText('test authorization stop')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integration/oauth/start',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/integration/oauth/configure',
      expect.anything(),
    )
    expect(screen.getByLabelText('Сохранённые данные приложения')).toHaveTextContent('123')
    expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument()
  })

  it('previews and confirms reimport from a selected local time', async () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout')
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/integration/status') {
        return Promise.resolve(jsonResponse(connectedStatus))
      }
      if (url === '/api/donations/reimport/preview') {
        return Promise.resolve(
          jsonResponse({ since: '2026-09-06T10:00:00+00:00', count: 2 }),
        )
      }
      if (url === '/api/donations/reimport') {
        return Promise.resolve(jsonResponse({ requeued: 2 }))
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<DonationAlertsPanel existingDonationSourceIds={['existing-1']} />)

    expect(await screen.findByText('Подключено')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /DonationAlerts/ }))
    expect(screen.getByRole('button', { name: '3 ДНЯ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5 ДНЕЙ' })).toBeInTheDocument()
    const dateTrigger = screen.getByLabelText('Дата повторного импорта (МСК)')
    expect(dateTrigger).toHaveAttribute('type', 'button')
    expect(dateTrigger.querySelector('svg')).toHaveClass('dark-date-icon')
    await user.click(dateTrigger)
    const calendar = screen.getByRole('dialog', {
      name: 'Выбор даты повторного импорта',
    })
    expect(calendar).toHaveClass('dark-date-calendar')
    await user.click(within(calendar).getByRole('button', { pressed: true }))
    expect(screen.queryByRole('dialog', {
      name: 'Выбор даты повторного импорта',
    })).not.toBeInTheDocument()
    const timeInput = screen.getByLabelText(
      'Время повторного импорта (МСК), 24 часа',
    )
    fireEvent.change(timeInput, { target: { value: '1400' } })
    expect(timeInput).toHaveAttribute('type', 'text')
    expect(timeInput).toHaveValue('14:00')
    await user.click(screen.getByRole('button', { name: 'ПЕРЕИМПОРТИРОВАТЬ' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Подготовить к повторному импорту 2 доната',
    )
    await user.click(screen.getByRole('button', { name: 'Переимпортировать' }))

    expect(
      await screen.findByText(/Подготовлено к повторному импорту: 2/),
    ).toBeInTheDocument()
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5_000)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/donations/reimport/preview',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"excludeSourceIds":["existing-1"]'),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/donations/reimport',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"excludeSourceIds":["existing-1"]'),
      }),
    )
  })

  it('explains a stale backend response instead of showing a JSON parser error', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/integration/status') {
        return Promise.resolve(jsonResponse(connectedStatus))
      }
      if (url === '/api/donations/reimport/preview') {
        return Promise.resolve(
          new Response('<!doctype html><title>405</title>', {
            status: 405,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<DonationAlertsPanel />)

    expect(await screen.findByText('Подключено')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /DonationAlerts/ }))
    await user.click(screen.getByRole('button', { name: 'ПЕРЕИМПОРТИРОВАТЬ' }))

    expect(
      await screen.findByText(/Локальный сервер вернул HTTP 405.*Перезапустите Gambalator/),
    ).toBeInTheDocument()
  })
})
