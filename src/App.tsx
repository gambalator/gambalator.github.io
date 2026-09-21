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
import { EntryList } from './components/EntryList'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DonationAlertsPanel } from './components/DonationAlertsPanel'
import { RoundHistory } from './components/RoundHistory'
import { WorkspaceTools } from './components/WorkspaceTools'
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
type Confirmation = 'remove-active' | 'clear-active' | 'clear-history'

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
  const [pendingRemovalIds, setPendingRemovalIds] = useState<string[] | null>(null)
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
    if (confirmation === 'remove-active' && pendingRemovalIds?.length) {
      await applyAction({ type: 'entries/remove', ids: pendingRemovalIds })
    }
    if (confirmation === 'clear-active') {
      const activeIds = state.entries
        .filter((entry) => entry.status === 'active')
        .map((entry) => entry.id)
      if (activeIds.length > 0) {
        await applyAction({ type: 'entries/remove', ids: activeIds })
      }
    }
    if (confirmation === 'clear-history') {
      await applyAction({ type: 'round-history/clear' })
    }
    setConfirmation(null)
    setPendingRemovalIds(null)
    setFeedback(null)
  }

  const cancelConfirmation = () => {
    setConfirmation(null)
    setPendingRemovalIds(null)
  }

  const confirmationCopy = confirmation
    ? {
        'remove-active': {
          title: pendingRemovalIds && pendingRemovalIds.length > 1
            ? 'Удалить активные донаты?'
            : 'Удалить активный донат?',
          message: pendingRemovalIds && pendingRemovalIds.length > 1
            ? 'Будут удалены все донаты из выбранной группы. Это действие нельзя отменить.'
            : 'Активный донат будет удалён. Это действие нельзя отменить.',
          confirmLabel: 'Удалить',
        },
        'clear-active': {
          title: 'Удалить активные донаты?',
          message: 'Будут удалены только активные донаты. История розыгрышей и настройки сохранятся.',
          confirmLabel: 'Удалить',
        },
        'clear-history': {
          title: 'Очистить историю розыгрышей?',
          message: 'Результаты раундов и списки их участников будут удалены. Активные донаты и настройки сохранятся.',
          confirmLabel: 'Очистить',
        },
      }[confirmation]
    : null

  const activeCount = state.entries.filter(
    (entry) => entry.status === 'active',
  ).length
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
        </div>
        <div className="header-stats" aria-label="Краткая сводка">
          <DonationAlertsPanel />
          <WorkspaceTools
            settings={state.settings}
            onUpdateSettings={(settings) => {
              void applyAction({ type: 'settings/update', settings })
            }}
            onDirtyChange={handleDirtyChange}
          />
        </div>
      </header>

      <main>
        {loaded.warning && (
          <div className="global-warning" role="status">
            {loaded.warning}
          </div>
        )}

        <RoundHistory
          history={state.history}
          entries={state.entries}
          settings={state.settings}
          onClear={() => setConfirmation('clear-history')}
        />

        <section className="panel contributions-panel" aria-label="Рабочая область донатов">
          <div className="entries-column">
            <EntryList
              entries={state.entries}
              settings={state.settings}
              persistenceReady={backendMode !== null}
              onUpdate={(entry) => void applyAction({ type: 'entry/update', entry })}
              onRemove={(idOrIds) => {
                setPendingRemovalIds(
                  Array.isArray(idOrIds) ? idOrIds : [idOrIds],
                )
                setConfirmation('remove-active')
              }}
              onReorder={(activeIds) =>
                void applyAction({ type: 'entries/reorder', activeIds })
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
                  onClick={() => void calculate(1)}
                  disabled={activeCount === 0 || settingsDirty || backendMode === null}
                >
                  Рассчитать один
                </button>
                <button
                  className="button secondary calculate-one-button"
                  type="button"
                  onClick={() => void calculate(null)}
                  disabled={activeCount === 0 || settingsDirty || backendMode === null}
                  title={
                    settingsDirty
                      ? 'Сначала сохраните изменения в настройках'
                      : undefined
                  }
                >
                  Рассчитать все
                </button>
              </div>
              <div className="secondary-actions">
                <button
                  className="text-button danger-text"
                  type="button"
                  onClick={() => setConfirmation('clear-active')}
                  disabled={activeCount === 0}
                >
                  Удалить активные донаты
                </button>
              </div>
              <EntryForm
                createId={createId}
                onAdd={(entry) => {
                  void applyAction({ type: 'entry/add', entry })
                  setFeedback(null)
                }}
              />
            </div>
          </div>
        </section>
      </main>

      {confirmationCopy && (
        <ConfirmDialog
          title={confirmationCopy.title}
          message={confirmationCopy.message}
          confirmLabel={confirmationCopy.confirmLabel}
          onConfirm={confirmPendingAction}
          onCancel={cancelConfirmation}
        />
      )}
    </div>
  )
}
