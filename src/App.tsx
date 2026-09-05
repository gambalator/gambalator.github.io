import { useCallback, useEffect, useReducer, useState } from 'react'
import { EntryForm } from './components/EntryForm'
import { EntryList } from './components/EntryList'
import { ConfirmDialog } from './components/ConfirmDialog'
import { RoundHistory } from './components/RoundHistory'
import { SettingsPanel } from './components/SettingsPanel'
import { calculateRounds } from './domain/calculateRounds'
import { formatTenths } from './domain/money'
import { appReducer } from './state'
import { loadState, saveState } from './storage/localStorage'

type Feedback = { tone: 'success' | 'neutral' | 'error'; text: string }
type Confirmation = 'clear-used' | 'clear-entries' | 'clear-history'

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

  useEffect(() => {
    saveState(state)
  }, [state])

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
        state.history.length + 1,
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

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand-mark" aria-hidden="true">G</div>
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

        <SettingsPanel
          settings={state.settings}
          onUpdate={(settings) =>
            dispatch({ type: 'settings/update', settings })
          }
          onDirtyChange={handleDirtyChange}
        />

        <section className="panel contributions-panel" aria-labelledby="entries-title">
          <div className="section-heading entries-heading">
            <div>
              <p className="eyebrow" id="entries-title">Очередь донатов</p>
            </div>
            <div className="count-pills" aria-label="Состояние записей">
              <span>{activeCount} активных</span>
              <span>{consumedCount} использовано</span>
            </div>
          </div>

          <EntryForm
            createId={createId}
            onAdd={(entry) => {
              dispatch({ type: 'entry/add', entry })
              setFeedback(null)
            }}
          />

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
              <p className="local-note">
                Данные сохраняются только в этом браузере и на этом устройстве.
              </p>
            </div>

            <RoundHistory
              history={state.history}
              onClear={() => setConfirmation('clear-history')}
            />
          </div>
        </section>
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
