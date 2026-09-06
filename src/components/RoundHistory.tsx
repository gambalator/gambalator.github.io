import { useEffect, useRef, useState } from 'react'
import { formatTenths } from '../domain/money'
import type { RoundResult } from '../types'

interface RoundHistoryProps {
  history: RoundResult[]
  onClear: () => void
}

interface HistoryListProps {
  history: RoundResult[]
  expanded?: boolean
}

function HistoryList({ history, expanded = false }: HistoryListProps) {
  return (
    <ol className={`history-list${expanded ? ' history-list-expanded' : ''}`}>
      {[...history].reverse().map((result) => (
        <li
          key={result.id}
          className={result.isLatest === false ? 'previous-winner' : 'latest-winner'}
        >
          <span className="round-number">
            <span className="round-label">Гамбашар </span>
            {result.roundNumber}
          </span>
          <strong className={result.winner === 'Chat' ? 'chat-winner' : ''}>
            {result.winner}
          </strong>
          <span>{formatTenths(result.winningRubTenths)} RUB</span>
        </li>
      ))}
    </ol>
  )
}

interface WinnerHistoryDialogProps {
  history: RoundResult[]
  onClose: () => void
}

function WinnerHistoryDialog({ history, onClose }: WinnerHistoryDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div
      className="dialog-backdrop history-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="winner-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="winner-history-dialog-title"
      >
        <div className="winner-history-dialog-heading">
          <div>
            <p className="eyebrow">Результаты</p>
            <h2 id="winner-history-dialog-title">История победителей</h2>
          </div>
          <button
            ref={closeRef}
            className="history-dialog-close"
            type="button"
            aria-label="Закрыть историю победителей"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <HistoryList history={history} expanded />
      </div>
    </div>
  )
}

export function RoundHistory({ history, onClear }: RoundHistoryProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <aside className="history-card" aria-labelledby="history-title">
        <div className="history-heading">
          <div>
            <p className="eyebrow">Результаты</p>
            <h3 id="history-title">История победителей</h3>
          </div>
          {history.length > 0 && (
            <div className="history-heading-actions">
              <button
                className="history-open-button"
                type="button"
                aria-label="Открыть историю победителей полностью"
                title="Открыть полностью"
                onClick={() => setDialogOpen(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
                </svg>
              </button>
              <button className="text-button" type="button" onClick={onClear}>
                Очистить историю
              </button>
            </div>
          )}
        </div>

        {history.length === 0 ? (
          <div className="history-empty">
            <span aria-hidden="true">◎</span>
            <p>Здесь появятся победители завершённых раундов.</p>
          </div>
        ) : (
          <HistoryList history={history} />
        )}
      </aside>

      {dialogOpen && (
        <WinnerHistoryDialog history={history} onClose={() => setDialogOpen(false)} />
      )}
    </>
  )
}
