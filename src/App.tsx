import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import logoUrl from '../newbnny.png'
import { APP_VERSION } from './version'
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
  fetchCalculatorState,
  sendCalculatorAction,
} from './integrations/calculatorBackend'
import { appReducer, type AppAction } from './state'
import { loadState, saveState } from './storage/localStorage'
import { DEFAULT_STATE } from './types'

type Feedback = { tone: 'success' | 'neutral' | 'error'; text: string }
type Confirmation = 'clear-used' | 'clear-entries' | 'clear-history'

const STATE_POLL_INTERVAL_MS = 1_000

function createId(): string {
  return crypto.randomUUID()
}

export default function App() {
  const [loaded] = useState(() => loadState())
  const [state, dispatch] = useReducer(appReducer, DEFAULT_STATE)
  const [backendMode, setBackendMode] = useState<boolean | null>(null)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const stateRef = useRef(state)
  const backendRevisionRef = useRef(0)

  useLayoutEffect(() => {
    stateRef.current = state
    if (backendMode === false) saveState(state)
  }, [backendMode, state])

  useEffect(() => {
    const controller = new AbortController()
    void fetchCalculatorState(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return
        backendRevisionRef.current = response.revision
        dispatch({ type: 'state/replace', state: response.state })
        setBackendMode(true)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        dispatch({ type: 'state/replace', state: loaded.state })
        setBackendMode(false)
        if (loaded.warning) {
          setFeedback({ tone: 'error', text: loaded.warning })
        }
      })
    return () => {
      controller.abort()
    }
  }, [loaded])

  useEffect(() => {
    if (backendMode !== true) return
    const controller = new AbortController()
    const poll = window.setInterval(() => {
      void fetchCalculatorState(controller.signal)
        .then((response) => {
          if (response.revision <= backendRevisionRef.current) return
          backendRevisionRef.current = response.revision
          dispatch({ type: 'state/replace', state: response.state })
        })
        .catch(() => undefined)
    }, STATE_POLL_INTERVAL_MS)
    return () => {
      controller.abort()
      window.clearInterval(poll)
    }
  }, [backendMode])

  useEffect(() => {
    if (!feedback) return
    const timeoutId = window.setTimeout(() => setFeedback(null), 10_000)
    return () => window.clearTimeout(timeoutId)
  }, [feedback])

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setSettingsDirty(dirty)
  }, [])

  const applyAction = useCallback(async (action: AppAction) => {
    if (backendMode === null || action.type === 'state/replace') return
    if (backendMode === false) {
      dispatch(action)
      return
    }
    try {
      const response = await sendCalculatorAction(action)
      if (response.revision >= backendRevisionRef.current) {
        backendRevisionRef.current = response.revision
        dispatch({ type: 'state/replace', state: response.state })
      }
      return response.calculation
    } catch {
      setFeedback({
        tone: 'error',
        text: 'Не удалось сохранить изменение на локальном сервере.',
      })
    }
  }, [backendMode])

  const calculate = async (maxRounds: 1 | null) => {
    try {
      if (backendMode === true) {
        const calculation = await applyAction({
          type: 'calculation/run',
          maxRounds,
        } as AppAction)
        if (!calculation) return
        if (calculation.completedRounds === 0) {
          setFeedback({
            tone: 'neutral',
            text: `До завершения раунда не хватает ${formatTenths(calculation.remainingNeededTenths)} RUB. Записи не изменены.`,
          })
          return
        }
        setFeedback({
          tone: 'success',
          text: `Готово: завершено раундов — ${calculation.completedRounds}.`,
        })
        return
      }

      const outcome = calculateRounds(
        state.entries,
        state.settings,
        nextRoundNumber(state.entries, state.history),
        createId,
        maxRounds ?? undefined,
      )

      if (outcome.completedRounds === 0) {
        setFeedback({
          tone: 'neutral',
          text: `До завершения раунда не хватает ${formatTenths(outcome.remainingNeededTenths)} RUB. Записи не изменены.`,
        })
        return
      }

      await applyAction({
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

  const confirmPendingAction = async () => {
    if (confirmation === 'clear-used') await applyAction({ type: 'used/clear' })
    if (confirmation === 'clear-entries') await applyAction({ type: 'entries/clear' })
    if (confirmation === 'clear-history') await applyAction({ type: 'history/clear' })
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
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand-mark" aria-hidden="true">
          <img src={logoUrl} alt="" />
        </div>
        <div className="brand-copy">
          <h1>
            Gambalator <span className="brand-version" aria-label={`Версия ${APP_VERSION}`}>{APP_VERSION}</span>
          </h1>
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

        <DonationAlertsPanel />

        <section className="panel contributions-panel" aria-label="Рабочая область донатов">
          <EntryForm
            createId={createId}
            onAdd={(entry) => {
              void applyAction({ type: 'entry/add', entry })
              setFeedback(null)
            }}
          />

          <div className="section-divider form-divider" aria-hidden="true" />

          <div className="workspace-grid">
            <div className="entries-column">
              <EntryList
                entries={state.entries}
                settings={state.settings}
                onUpdate={(entry) => void applyAction({ type: 'entry/update', entry })}
                onRemove={(id) => void applyAction({ type: 'entry/remove', id })}
                onReorder={(activeId, overId) =>
                  void applyAction({ type: 'entry/reorder', activeId, overId })
                }
              />

              <div className="section-divider entries-divider" aria-hidden="true" />

              {feedback && (
                <div className={`feedback ${feedback.tone}`} role="status">
                  {feedback.text}
                </div>
              )}

              <div className="calculation-actions">
                <div className="calculate-buttons">
                  <button
                    className="button calculate-button"
                    type="button"
                    onClick={() => void calculate(null)}
                    disabled={activeCount === 0 || settingsDirty || backendMode === null}
                    title={
                      settingsDirty
                        ? 'Сначала сохраните изменения в настройках'
                        : undefined
                    }
                  >
                    РАССЧИТАТЬ ВСЕ
                  </button>
                  <button
                    className="button secondary calculate-one-button"
                    type="button"
                    onClick={() => void calculate(1)}
                    disabled={activeCount === 0 || settingsDirty || backendMode === null}
                  >
                    Рассчитать один
                  </button>
                </div>
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
          onUpdate={(settings) => {
            void applyAction({ type: 'settings/update', settings })
          }}
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
