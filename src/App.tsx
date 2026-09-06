import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import logoUrl from '../newbnny.png'
import { EntryForm } from './components/EntryForm'
import { EntryList, UsedEntries } from './components/EntryList'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DonationAlertsPanel } from './components/DonationAlertsPanel'
import { RoundHistory } from './components/RoundHistory'
import { SettingsPanel } from './components/SettingsPanel'
import { calculateRounds } from './domain/calculateRounds'
import { formatTenths } from './domain/money'
import { nextRoundNumber } from './domain/nextRoundNumber'
import {
  acknowledgeDonation,
  donationSourceId,
  donationToEntry,
  fetchPendingDonations,
} from './integrations/donationAlerts'
import { appReducer } from './state'
import { loadState, saveState } from './storage/localStorage'
import type { ContributionEntry } from './types'

type Feedback = { tone: 'success' | 'neutral' | 'error'; text: string }
type Confirmation = 'clear-used' | 'clear-entries' | 'clear-history'

const DONATION_IMPORT_INTERVAL_MS = 5_000

function createId(): string {
  return crypto.randomUUID()
}

export default function App() {
  const [loaded] = useState(() => loadState())
  const [state, dispatch] = useReducer(appReducer, loaded.state)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(
    loaded.warning ? { tone: 'error', text: loaded.warning } : null,
  )
  const stateRef = useRef(state)
  const acknowledgeAfterSaveRef = useRef(new Set<string>())
  const acknowledgementInFlightRef = useRef(new Set<string>())
  const acknowledgementQueueRef = useRef<string[]>([])
  const acknowledgementQueuedRef = useRef(new Set<string>())
  const acknowledgementWorkerRunningRef = useRef(false)
  const lastUnsupportedNoticeRef = useRef('')

  const processAcknowledgementQueue = useCallback(async () => {
    if (acknowledgementWorkerRunningRef.current) return
    acknowledgementWorkerRunningRef.current = true
    try {
      while (acknowledgementQueueRef.current.length > 0) {
        const sourceId = acknowledgementQueueRef.current.shift()
        if (sourceId === undefined) continue
        acknowledgementQueuedRef.current.delete(sourceId)
        acknowledgementInFlightRef.current.add(sourceId)
        try {
          await acknowledgeDonation(sourceId)
        } catch {
          // The backend keeps failed acknowledgements pending for a later poll retry.
        } finally {
          acknowledgementInFlightRef.current.delete(sourceId)
        }
      }
    } finally {
      acknowledgementWorkerRunningRef.current = false
    }
  }, [])

  const acknowledgeSourceIds = useCallback((sourceIds: Iterable<string>) => {
    for (const sourceId of sourceIds) {
      if (
        acknowledgementInFlightRef.current.has(sourceId) ||
        acknowledgementQueuedRef.current.has(sourceId)
      ) {
        continue
      }
      acknowledgementQueuedRef.current.add(sourceId)
      acknowledgementQueueRef.current.push(sourceId)
    }
    void processAcknowledgementQueue()
  }, [processAcknowledgementQueue])

  useLayoutEffect(() => {
    stateRef.current = state
    const saved = saveState(state)
    if (!saved) {
      if (acknowledgeAfterSaveRef.current.size > 0) {
        setFeedback({
          tone: 'error',
          text: 'Не удалось сохранить импортированные донаты. Они не подтверждены и будут повторно обработаны.',
        })
      }
      return
    }

    const persistedSourceIds = new Set(
      state.entries
        .map(donationSourceId)
        .filter((sourceId): sourceId is string => sourceId !== null),
    )
    const readyToAcknowledge = [...acknowledgeAfterSaveRef.current].filter(
      (sourceId) => persistedSourceIds.has(sourceId),
    )
    for (const sourceId of readyToAcknowledge) {
      acknowledgeAfterSaveRef.current.delete(sourceId)
    }
    acknowledgeSourceIds(readyToAcknowledge)
  }, [acknowledgeSourceIds, state])

  useEffect(() => {
    const controller = new AbortController()
    let timeoutId: number | undefined

    const pollPendingDonations = async () => {
      try {
        const donations = await fetchPendingDonations(controller.signal)
        if (controller.signal.aborted) return

        const currentState = stateRef.current
        const existingSourceIds = new Set(
          currentState.entries
            .map(donationSourceId)
            .filter((sourceId): sourceId is string => sourceId !== null),
        )
        const newEntries: ContributionEntry[] = []
        const alreadyPersisted: string[] = []
        const unsupportedCurrencies = new Set<string>()

        for (const donation of donations) {
          const entry = donationToEntry(donation)
          if (entry === null) {
            unsupportedCurrencies.add(donation.currency)
            continue
          }
          if (existingSourceIds.has(donation.sourceId)) {
            alreadyPersisted.push(donation.sourceId)
            continue
          }
          existingSourceIds.add(donation.sourceId)
          newEntries.push(entry)
        }

        if (alreadyPersisted.length > 0 && saveState(currentState)) {
          acknowledgeSourceIds(alreadyPersisted)
        }

        if (newEntries.length > 0) {
          for (const entry of newEntries) {
            const sourceId = donationSourceId(entry)
            if (sourceId !== null) acknowledgeAfterSaveRef.current.add(sourceId)
          }
          dispatch({ type: 'entries/import', entries: newEntries })
        }

        const unsupported = [...unsupportedCurrencies].sort()
        const unsupportedSignature = unsupported.join(',')
        const unsupportedText = unsupported.length > 0
          ? ` Валюта ${unsupported.join(', ')} пока не поддерживается; такие донаты оставлены в ожидании.`
          : ''

        if (newEntries.length > 0) {
          setFeedback({
            tone: unsupported.length > 0 ? 'neutral' : 'success',
            text: `DonationAlerts: импортировано донатов — ${newEntries.length}.${unsupportedText}`,
          })
        } else if (
          unsupported.length > 0 &&
          unsupportedSignature !== lastUnsupportedNoticeRef.current
        ) {
          setFeedback({
            tone: 'neutral',
            text: `DonationAlerts:${unsupportedText}`,
          })
        }
        lastUnsupportedNoticeRef.current = unsupportedSignature
      } catch {
        if (controller.signal.aborted) return
      } finally {
        if (!controller.signal.aborted) {
          timeoutId = window.setTimeout(
            () => void pollPendingDonations(),
            DONATION_IMPORT_INTERVAL_MS,
          )
        }
      }
    }

    void pollPendingDonations()
    return () => {
      controller.abort()
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [acknowledgeSourceIds])

  useEffect(() => {
    if (!feedback) return
    const timeoutId = window.setTimeout(() => setFeedback(null), 10_000)
    return () => window.clearTimeout(timeoutId)
  }, [feedback])

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setSettingsDirty(dirty)
  }, [])

  const calculate = () => {
    try {
      const outcome = calculateRounds(
        state.entries,
        state.settings,
        nextRoundNumber(state.entries, state.history),
        createId,
      )

      if (outcome.completedRounds === 0) {
        setFeedback({
          tone: 'neutral',
          text: `До завершения раунда не хватает ${formatTenths(outcome.remainingNeededTenths)} RUB. Записи не изменены.`,
        })
        return
      }

      dispatch({
        type: 'calculation/apply',
        entries: outcome.entries,
        results: outcome.newResults,
      })
      setFeedback({
        tone: 'success',
        text: `Готово: завершено раундов — ${outcome.completedRounds}.`,
      })
    } catch {
      setFeedback({
        tone: 'error',
        text: 'Не удалось выполнить расчёт. Проверьте суммы и попробуйте ещё раз.',
      })
    }
  }

  const confirmPendingAction = () => {
    if (confirmation === 'clear-used') dispatch({ type: 'used/clear' })
    if (confirmation === 'clear-entries') dispatch({ type: 'entries/clear' })
    if (confirmation === 'clear-history') dispatch({ type: 'history/clear' })
    setConfirmation(null)
    setFeedback(null)
  }

  const confirmationCopy = confirmation
    ? {
        'clear-used': {
          title: 'Удалить использованные записи?',
          message: 'История победителей и активные записи сохранятся.',
          confirmLabel: 'Удалить',
        },
        'clear-entries': {
          title: 'Очистить все записи?',
          message: 'Активные и использованные записи будут удалены. История и настройки сохранятся.',
          confirmLabel: 'Очистить',
        },
        'clear-history': {
          title: 'Очистить историю победителей?',
          message: 'Записи и настройки останутся без изменений.',
          confirmLabel: 'Очистить',
        },
      }[confirmation]
    : null

  const activeCount = state.entries.filter(
    (entry) => entry.status === 'active',
  ).length
  const consumedCount = state.entries.length - activeCount
  const importedSourceIds = state.entries
    .map(donationSourceId)
    .filter((sourceId): sourceId is string => sourceId !== null)

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand-mark" aria-hidden="true">
          <img src={logoUrl} alt="" />
        </div>
        <div className="brand-copy">
          <h1>Gambalator</h1>
          <p>Считаем вклад. Находим лидера.</p>
        </div>
        <div className="header-stats" aria-label="Краткая сводка">
          <span>
            Раунд <strong>{formatTenths(state.settings.roundTargetTenths)} ₽</strong>
          </span>
          <span>
            Активных <strong>{activeCount}</strong>
          </span>
          <span>
            Завершено <strong>{state.history.length}</strong>
          </span>
        </div>
      </header>

      <main>
        {loaded.warning && (
          <div className="global-warning" role="status">
            {loaded.warning}
          </div>
        )}

        <DonationAlertsPanel existingDonationSourceIds={importedSourceIds} />

        <section className="panel contributions-panel" aria-label="Рабочая область донатов">
          <EntryForm
            createId={createId}
            onAdd={(entry) => {
              dispatch({ type: 'entry/add', entry })
              setFeedback(null)
            }}
          />

          <div className="section-divider form-divider" aria-hidden="true" />

          <div className="workspace-grid">
            <div className="entries-column">
              <EntryList
                entries={state.entries}
                settings={state.settings}
                onUpdate={(entry) => dispatch({ type: 'entry/update', entry })}
                onRemove={(id) => dispatch({ type: 'entry/remove', id })}
                onReorder={(activeId, overId) =>
                  dispatch({ type: 'entry/reorder', activeId, overId })
                }
              />

              <div className="section-divider entries-divider" aria-hidden="true" />

              {feedback && (
                <div className={`feedback ${feedback.tone}`} role="status">
                  {feedback.text}
                </div>
              )}

              <div className="calculation-actions">
                <button
                  className="button calculate-button"
                  type="button"
                  onClick={calculate}
                  disabled={activeCount === 0 || settingsDirty}
                  title={
                    settingsDirty
                      ? 'Сначала сохраните изменения в настройках'
                      : undefined
                  }
                >
                  РАССЧИТАТЬ
                </button>
                <div className="secondary-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setConfirmation('clear-used')}
                    disabled={consumedCount === 0}
                  >
                    Удалить использованные
                  </button>
                  <button
                    className="text-button danger-text"
                    type="button"
                    onClick={() => setConfirmation('clear-entries')}
                    disabled={state.entries.length === 0}
                  >
                    Очистить все записи
                  </button>
                </div>
              </div>
              <UsedEntries entries={state.entries} settings={state.settings} />
            </div>

            <RoundHistory
              history={state.history}
              onClear={() => setConfirmation('clear-history')}
            />
          </div>
        </section>

        <SettingsPanel
          settings={state.settings}
          onUpdate={(settings) =>
            dispatch({ type: 'settings/update', settings })
          }
          onDirtyChange={handleDirtyChange}
        />
      </main>

      <footer>
        Gambalator <span>·</span> локальный расчёт без передачи данных
      </footer>

      {confirmationCopy && (
        <ConfirmDialog
          title={confirmationCopy.title}
          message={confirmationCopy.message}
          confirmLabel={confirmationCopy.confirmLabel}
          onConfirm={confirmPendingAction}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </div>
  )
}
