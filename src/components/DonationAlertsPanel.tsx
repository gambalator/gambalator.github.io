import { useCallback, useEffect, useState } from 'react'
import {
  displayMoscowTime,
  moscowDateTimeLocalValue,
  parseMoscowDateTimeLocal,
  startOfMoscowDayValue,
} from '../domain/moscowTime'
import { ChatToggle } from './ChatToggle'
import { ConfirmDialog } from './ConfirmDialog'
import { DarkDatePicker } from './DarkDatePicker'

interface OAuthStatus {
  applicationConfigured: boolean
  apiKeyStored: boolean
  connected: boolean
  reauthorizationRequired: boolean
  clientId: string | null
  redirectUri: string
  credentialStorage: string
  secureCredentialStorage: boolean
}

interface IntegrationStatus {
  configured: boolean
  connected: boolean
  running: boolean
  lastPersistedSuccessAt: string | null
  lastError: string | null
  pendingDonations: number
  credentialError: string | null
  credentialSource: 'environment' | 'oauth'
  autoChatEnabled: boolean
  oauth: OAuthStatus
}

interface ReimportPreview {
  since: string
  displaySince: string
  count: number
  excludedSourceIds: string[]
}

interface DonationAlertsPanelProps {
  existingDonationSourceIds?: string[]
}

interface ReimportSelection {
  date: string
  time: string
}

type ConnectionTone = 'checking' | 'connected' | 'disconnected' | 'error'

interface ConnectionLinkState {
  label: string
  tone: ConnectionTone
}

const TRANSIENT_NOTICE_DURATION_MS = 5_000
const TRANSIENT_NOTICE_PREFIXES = [
  'Подготовлено к повторному импорту:',
  'DonationAlerts успешно подключён.',
]

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.text()
  let payload: T & { error?: string }
  try {
    payload = JSON.parse(body) as T & { error?: string }
  } catch {
    if (!response.ok) {
      throw new Error(
        `Локальный сервер вернул HTTP ${response.status}. Перезапустите Gambalator, чтобы frontend и backend использовали одну версию.`,
      )
    }
    throw new Error('Локальный сервер вернул некорректный ответ.')
  }
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`)
  }
  return payload
}

function displayTime(value: string | null): string {
  if (!value) return 'ещё не выполнялась'
  return displayMoscowTime(value)
}

function storageLabel(value: string): string {
  if (value === 'environment') return 'переменная окружения'
  if (value === 'system-keyring') return 'системное хранилище'
  if (value === 'local-file') return 'локальный файл'
  return value
}

function oneHourAgo(): string {
  return moscowDateTimeLocalValue(new Date(Date.now() - 60 * 60 * 1_000))
}

function selectionFromValue(value: string): ReimportSelection {
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16),
  }
}

function format24HourInput(value: string): string {
  const cleaned = value.replace(/[^\d:]/g, '')
  if (cleaned.includes(':')) {
    const [hours = '', ...minuteParts] = cleaned.split(':')
    return `${hours.slice(0, 2)}:${minuteParts.join('').slice(0, 2)}`
  }
  const digits = cleaned.slice(0, 4)
  if (digits.length <= 2) return digits
  if (digits.length === 3 && Number(digits.slice(0, 2)) > 23) {
    return `0${digits.slice(0, 1)}:${digits.slice(1)}`
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function complete24HourInput(value: string): string {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value)
  if (!match) return value
  return `${match[1]?.padStart(2, '0')}:${match[2]?.padStart(2, '0')}`
}

function donationCountLabel(count: number): string {
  const lastTwoDigits = count % 100
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} донатов`
  const lastDigit = count % 10
  if (lastDigit === 1) return `${count} донат`
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} доната`
  return `${count} донатов`
}

export function DonationAlertsPanel({
  existingDonationSourceIds = [],
}: DonationAlertsPanelProps) {
  const oauthResult = new URLSearchParams(window.location.search).get('donationalerts')
  const [expanded, setExpanded] = useState(oauthResult !== null)
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(
    oauthResult === 'connected' ? 'DonationAlerts успешно подключён.' : '',
  )
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [reimportSelection, setReimportSelection] = useState(() =>
    selectionFromValue(oneHourAgo()),
  )
  const [reimportBusy, setReimportBusy] = useState(false)
  const [reimportPreview, setReimportPreview] = useState<ReimportPreview | null>(null)
  const [autoChatBusy, setAutoChatBusy] = useState(false)

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/integration/status', {
        headers: { Accept: 'application/json' },
        signal,
      })
      const nextStatus = await responseJson<IntegrationStatus>(response)
      setStatus(nextStatus)
      setBackendAvailable(true)
      setClientId((current) => current || nextStatus.oauth.clientId || '')
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setBackendAvailable(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const initialTimeout = window.setTimeout(() => {
      void refreshStatus(controller.signal)
    }, 0)
    const interval = window.setInterval(() => {
      void refreshStatus(controller.signal)
    }, 5_000)
    return () => {
      controller.abort()
      window.clearTimeout(initialTimeout)
      window.clearInterval(interval)
    }
  }, [refreshStatus])

  useEffect(() => {
    if (!TRANSIENT_NOTICE_PREFIXES.some((prefix) => notice.startsWith(prefix))) return
    const timeoutId = window.setTimeout(() => setNotice(''), TRANSIENT_NOTICE_DURATION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  useEffect(() => {
    if (!oauthResult) return
    const url = new URL(window.location.href)
    url.searchParams.delete('donationalerts')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [oauthResult])

  const openAuthorizationPage = async () => {
    const startResponse = await fetch('/api/integration/oauth/start', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
    const result = await responseJson<{ authorizationUrl: string }>(startResponse)
    window.location.assign(result.authorizationUrl)
  }

  const connect = async () => {
    setError('')
    setNotice('')
    const clientIdChanged = clientId.trim() !== (status?.oauth.clientId ?? '')
    const shouldConfigure = clientSecret.trim() !== '' || clientIdChanged
    if (shouldConfigure && (!clientId.trim() || !clientSecret.trim())) {
      setError('Введите App ID и API Key вместе.')
      return
    }
    if (!shouldConfigure && !status?.oauth.applicationConfigured) {
      setError('Введите данные приложения DonationAlerts.')
      return
    }

    setBusy(true)
    try {
      if (shouldConfigure) {
        const configureResponse = await fetch('/api/integration/oauth/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ clientId: clientId.trim(), clientSecret }),
        })
        await responseJson<OAuthStatus>(configureResponse)
        setClientSecret('')
      }

      await openAuthorizationPage()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось начать подключение DonationAlerts.',
      )
      setBusy(false)
    }
  }

  const reauthorize = async () => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await openAuthorizationPage()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось начать повторную авторизацию DonationAlerts.',
      )
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setConfirmDisconnect(false)
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/integration/disconnect', { method: 'POST' })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? `HTTP ${response.status}`)
      }
      setNotice('DonationAlerts отключён. Данные приложения сохранены.')
      await refreshStatus()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Не удалось отключить DonationAlerts.',
      )
    } finally {
      setBusy(false)
    }
  }

  const selectMinutesAgo = (minutes: number) => {
    setReimportSelection(
      selectionFromValue(
        moscowDateTimeLocalValue(new Date(Date.now() - minutes * 60 * 1_000)),
      ),
    )
  }

  const updateAutoChat = async (enabled: boolean) => {
    if (autoChatBusy) return
    setAutoChatBusy(true)
    setError('')
    try {
      const response = await fetch('/api/settings/auto-chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const result = await responseJson<{ enabled: boolean }>(response)
      setStatus((current) =>
        current ? { ...current, autoChatEnabled: result.enabled } : current,
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось изменить режим Chat.',
      )
    } finally {
      setAutoChatBusy(false)
    }
  }

  const selectToday = () => {
    setReimportSelection(selectionFromValue(startOfMoscowDayValue(new Date())))
  }

  const previewReimport = async () => {
    setError('')
    setNotice('')
    const selectedDate = parseMoscowDateTimeLocal(
      `${reimportSelection.date}T${reimportSelection.time}`,
    )
    if (selectedDate === null) {
      setError('Выберите корректные дату и время для повторного импорта.')
      return
    }
    if (selectedDate.getTime() > Date.now()) {
      setError('Дата повторного импорта не может быть в будущем.')
      return
    }

    setReimportBusy(true)
    try {
      const since = selectedDate.toISOString()
      const excludedSourceIds = [...new Set(existingDonationSourceIds)]
      const response = await fetch('/api/donations/reimport/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ since, excludeSourceIds: excludedSourceIds }),
      })
      const result = await responseJson<{ since: string; count: number }>(response)
      if (result.count === 0) {
        setNotice('За выбранный период нет удалённых донатов для повторного импорта.')
        return
      }
      setReimportPreview({
        since: result.since,
        displaySince: displayMoscowTime(selectedDate.toISOString()),
        count: result.count,
        excludedSourceIds,
      })
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось проверить донаты для повторного импорта.',
      )
    } finally {
      setReimportBusy(false)
    }
  }

  const confirmReimport = async () => {
    const preview = reimportPreview
    if (!preview) return
    setReimportPreview(null)
    setReimportBusy(true)
    setError('')
    try {
      const excludeSourceIds = [
        ...new Set([
          ...preview.excludedSourceIds,
          ...existingDonationSourceIds,
        ]),
      ]
      const response = await fetch('/api/donations/reimport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ since: preview.since, excludeSourceIds }),
      })
      const result = await responseJson<{ requeued: number }>(response)
      setNotice(
        `Подготовлено к повторному импорту: ${result.requeued}. Отсутствующие записи скоро появятся в очереди.`,
      )
      await refreshStatus()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось подготовить донаты к повторному импорту.',
      )
    } finally {
      setReimportBusy(false)
    }
  }

  const summary = backendAvailable === false
    ? 'Локальный сервер недоступен'
    : status?.oauth.reauthorizationRequired
      ? 'Требуется повторная авторизация'
      : status?.lastError
        ? 'Ошибка синхронизации'
        : status?.connected && !status.running
          ? 'Синхронизация остановлена'
          : status?.connected
            ? 'Подключено'
            : 'Не подключено'

  const integrationHealthy =
    backendAvailable === true &&
    status?.connected === true &&
    status.running &&
    !status.lastError

  const frontendBackendConnection: ConnectionLinkState = backendAvailable === null
    ? { label: 'Проверка…', tone: 'checking' }
    : backendAvailable
      ? { label: 'Связь есть', tone: 'connected' }
      : { label: 'Нет связи', tone: 'disconnected' }

  const backendDonationAlertsConnection: ConnectionLinkState = backendAvailable === null
    ? { label: 'Проверка…', tone: 'checking' }
    : backendAvailable === false
      ? { label: 'Недоступно', tone: 'disconnected' }
      : status?.oauth.reauthorizationRequired
        ? { label: 'Нужна авторизация', tone: 'error' }
        : status?.lastError
          ? { label: 'Ошибка обмена', tone: 'error' }
          : status?.connected && status.running
            ? { label: 'Синхронизация активна', tone: 'connected' }
            : status?.connected
              ? { label: 'Синхронизация остановлена', tone: 'error' }
              : { label: 'Не подключено', tone: 'disconnected' }

  return (
    <section
      className={`panel integration-panel${expanded ? ' expanded' : ''}`}
      aria-labelledby="donationalerts-title"
    >
      <button
        className="integration-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls="donationalerts-content"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="integration-title" id="donationalerts-title">
          DonationAlerts
        </span>
        <span
          className={`integration-status${integrationHealthy ? ' connected' : ''}${status?.lastError || status?.oauth.reauthorizationRequired ? ' error' : ''}`}
        >
          <span className="status-dot" aria-hidden="true" />
          {summary}
        </span>
        <span className={`chevron${expanded ? ' open' : ''}`} aria-hidden="true">⌄</span>
      </button>

      <div className="connection-map" aria-label="Состояние подключений" aria-live="polite">
        <span className="connection-node">Веб-страница</span>
        <span className={`connection-link ${frontendBackendConnection.tone}`}>
          <span className="connection-line" aria-hidden="true" />
          <strong>{frontendBackendConnection.label}</strong>
          <span className="connection-arrow" aria-hidden="true">→</span>
        </span>
        <span className="connection-node">Локальный сервер</span>
        <span className={`connection-link ${backendDonationAlertsConnection.tone}`}>
          <span className="connection-line" aria-hidden="true" />
          <strong>{backendDonationAlertsConnection.label}</strong>
          <span className="connection-arrow" aria-hidden="true">→</span>
        </span>
        <span className="connection-node donation-alerts-node">DonationAlerts</span>
      </div>

      {expanded && (
        <div className="integration-content" id="donationalerts-content">
          {backendAvailable === false ? (
            <p className="integration-message">
              Автоматический импорт работает только через локальный сервер. Запустите
              приложение командой <code>mise run local</code>.
            </p>
          ) : status?.oauth.reauthorizationRequired ? (
            <div className="reauthorization-card">
              <div className="reauthorization-copy">
                <strong>Требуется повторная авторизация</strong>
                <span>
                  DonationAlerts больше не принимает сохранённую авторизацию. App ID и
                  API Key остались в локальном хранилище — вводить их заново не нужно.
                </span>
                <div
                  className="saved-oauth-summary"
                  aria-label="Сохранённые данные приложения"
                >
                  <span>
                    <small>App ID</small>
                    <b>{status.oauth.clientId}</b>
                  </span>
                  <span>
                    <small>API Key</small>
                    <b className="masked-api-key">
                      {status.oauth.apiKeyStored ? '••••••••••••' : 'не сохранён'}
                    </b>
                  </span>
                </div>
              </div>
              <button
                className="button primary reauthorize-button"
                type="button"
                onClick={reauthorize}
                disabled={busy}
              >
                {busy ? 'ПОДКЛЮЧЕНИЕ…' : 'ПЕРЕПОДКЛЮЧИТЬ DONATIONALERTS'}
              </button>
            </div>
          ) : status?.connected ? (
            <div className="integration-connected-card">
              <div>
                <strong>Подключение активно</strong>
                <span>Ожидают импорта: {status.pendingDonations}</span>
              </div>
              <div>
                <span>Последняя синхронизация</span>
                <strong>{displayTime(status.lastPersistedSuccessAt)}</strong>
              </div>
              <div>
                <span>Хранилище данных авторизации</span>
                <strong>
                  {storageLabel(
                    status.credentialSource === 'environment'
                      ? 'environment'
                      : status.oauth.credentialStorage,
                  )}
                </strong>
              </div>
              <div
                className={`integration-auto-chat-card${status.autoChatEnabled ? ' enabled' : ''}`}
              >
                <div className="auto-chat-copy">
                  <strong>Авто-Chat для новых донатов</strong>
                  <span>
                    Новые донаты DonationAlerts будут сохранены с включённым Chat.
                  </span>
                </div>
                <ChatToggle
                  checked={status.autoChatEnabled}
                  label="Включить Авто-Chat для новых донатов DonationAlerts"
                  onChange={(enabled) => void updateAutoChat(enabled)}
                  compact
                />
              </div>
              <div className="integration-reimport-card">
                <div className="reimport-copy">
                  <strong>Повторный импорт</strong>
                  <span>
                    Восстановить удалённые записи из локальной базы DonationAlerts.
                    Существующие записи не будут продублированы.
                  </span>
                </div>
                <div className="reimport-controls">
                  <div className="reimport-shortcuts" aria-label="Быстрый выбор периода">
                    <button type="button" onClick={() => selectMinutesAgo(10)}>
                      10 МИН
                    </button>
                    <button type="button" onClick={() => selectMinutesAgo(60)}>
                      1 ЧАС
                    </button>
                    <button type="button" onClick={selectToday}>
                      СЕГОДНЯ
                    </button>
                    <button type="button" onClick={() => selectMinutesAgo(3 * 24 * 60)}>
                      3 ДНЯ
                    </button>
                    <button type="button" onClick={() => selectMinutesAgo(5 * 24 * 60)}>
                      5 ДНЕЙ
                    </button>
                  </div>
                  <div className="reimport-date-row">
                    <span className="reimport-date-label">С даты и времени (МСК, 24 ч)</span>
                    <DarkDatePicker
                      label="Дата повторного импорта (МСК)"
                      value={reimportSelection.date}
                      max={moscowDateTimeLocalValue(new Date()).slice(0, 10)}
                      onChange={(date) =>
                        setReimportSelection((current) => ({
                          ...current,
                          date,
                        }))
                      }
                    />
                    <input
                      className="reimport-time-input"
                      aria-label="Время повторного импорта (МСК), 24 часа"
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="ЧЧ:ММ"
                      value={reimportSelection.time}
                      onChange={(event) =>
                        setReimportSelection((current) => ({
                          ...current,
                          time: format24HourInput(event.target.value),
                        }))
                      }
                      onBlur={() =>
                        setReimportSelection((current) => ({
                          ...current,
                          time: complete24HourInput(current.time),
                        }))
                      }
                    />
                    <button
                      className="button secondary reimport-button"
                      type="button"
                      onClick={() => void previewReimport()}
                      disabled={reimportBusy || busy}
                    >
                      {reimportBusy ? 'ПРОВЕРКА…' : 'ПЕРЕИМПОРТИРОВАТЬ'}
                    </button>
                  </div>
                </div>
              </div>
              {!status.oauth.secureCredentialStorage && status.credentialSource !== 'environment' && (
                <p className="credential-warning">
                  Системное хранилище недоступно: данные сохранены в локальном файле.
                </p>
              )}
              {status.lastError && <p className="integration-error">{status.lastError}</p>}
              {status.credentialSource === 'oauth' && (
                <button
                  className="text-button danger-text integration-disconnect"
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={busy}
                >
                  ОТКЛЮЧИТЬ
                </button>
              )}
            </div>
          ) : (
            <div className="oauth-setup-grid">
              <div className="oauth-instructions">
                <p>
                  Создайте приложение в DonationAlerts и укажите этот Redirect URI:
                </p>
                <input
                  aria-label="Redirect URI"
                  value={status?.oauth.redirectUri ?? 'http://127.0.0.1:5741/api/oauth/callback'}
                  readOnly
                />
                <a
                  href="https://www.donationalerts.com/application/clients"
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть приложения DonationAlerts
                </a>
              </div>
              <div className="oauth-fields">
                <label htmlFor="da-app-id">App ID</label>
                <input
                  id="da-app-id"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
                <label htmlFor="da-api-key">API Key</label>
                <input
                  id="da-api-key"
                  type="password"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  placeholder={status?.oauth.apiKeyStored ? '••••••••••••' : undefined}
                  aria-describedby={status?.oauth.apiKeyStored ? 'da-api-key-saved' : undefined}
                  autoComplete="off"
                />
                {status?.oauth.apiKeyStored && (
                  <small className="credential-saved-hint" id="da-api-key-saved">
                    API Key сохранён. Оставьте поле пустым, чтобы использовать его повторно.
                  </small>
                )}
                <button
                  className="button primary oauth-connect-button"
                  type="button"
                  onClick={connect}
                  disabled={busy || backendAvailable !== true}
                >
                  {busy ? 'ПОДКЛЮЧЕНИЕ…' : 'ПОДКЛЮЧИТЬ DONATIONALERTS'}
                </button>
              </div>
            </div>
          )}

          {notice && <p className="integration-notice">{notice}</p>}
          {status?.credentialError && (
            <p className="integration-error">{status.credentialError}</p>
          )}
          {error && <p className="integration-error">{error}</p>}
        </div>
      )}

      {confirmDisconnect && (
        <ConfirmDialog
          title="Отключить DonationAlerts?"
          message="Автоматическая синхронизация остановится. App ID и API Key сохранятся для повторного подключения."
          confirmLabel="Отключить"
          onConfirm={() => void disconnect()}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}

      {reimportPreview && (
        <ConfirmDialog
          title="Повторно импортировать донаты?"
          message={`Подготовить к повторному импорту ${donationCountLabel(reimportPreview.count)} с ${reimportPreview.displaySince}? Уже существующие записи не будут продублированы. История победителей не изменится.`}
          confirmLabel="Переимпортировать"
          onConfirm={() => void confirmReimport()}
          onCancel={() => setReimportPreview(null)}
        />
      )}
    </section>
  )
}
