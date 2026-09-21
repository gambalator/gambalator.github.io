import { useEffect, useMemo, useRef, useState } from 'react'
import {
  consumedRoundGroupsFor,
  type ConsumedRoundGroup,
} from '../domain/consumedRounds'
import { formatTenths } from '../domain/money'
import {
  DEFAULT_SETTINGS,
  type ContributionEntry,
  type RoundResult,
  type Settings,
} from '../types'
import {
  ConsumedRoundDetails,
} from './EntryList'

interface RoundHistoryProps {
  history: RoundResult[]
  entries?: ContributionEntry[]
  settings?: Settings
  onClear: () => void
}

interface MergedRound {
  roundNumber: number
  result?: RoundResult
  participants?: ConsumedRoundGroup
  winner: string
  winningRubTenths: number
  isChatWinner: boolean
}

function mergeRoundHistory(
  history: RoundResult[],
  entries: ContributionEntry[],
  settings: Settings,
): MergedRound[] {
  const resultsByRound = new Map(
    history.map((result) => [result.roundNumber, result]),
  )
  const participantsByRound = new Map(
    consumedRoundGroupsFor(entries, settings)
      .map((group) => [group.roundNumber, group]),
  )
  const roundNumbers = new Set([
    ...resultsByRound.keys(),
    ...participantsByRound.keys(),
  ])

  return [...roundNumbers]
    .sort((first, second) => second - first)
    .map((roundNumber) => {
      const result = resultsByRound.get(roundNumber)
      const participants = participantsByRound.get(roundNumber)
      return {
        roundNumber,
        result,
        participants,
        winner: result?.winner ?? participants?.winner ?? 'Результат не сохранён',
        winningRubTenths:
          result?.winningRubTenths ?? participants?.winningRubTenths ?? 0,
        isChatWinner: result?.isChatWinner ?? participants?.chatWins ?? false,
      }
    })
}

function HistoryList({ rounds }: { rounds: MergedRound[] }) {
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set())
  const newestRoundNumber = rounds[0]?.roundNumber

  const toggleRound = (roundNumber: number) => {
    setExpandedRounds((current) => {
      const next = new Set(current)
      if (next.has(roundNumber)) next.delete(roundNumber)
      else next.add(roundNumber)
      return next
    })
  }

  return (
    <ol className="history-list history-list-expanded merged-history-list">
      {rounds.map((round) => {
        const expandable = Boolean(round.participants?.items.length)
        const expanded = expandable && expandedRounds.has(round.roundNumber)
        const summary = (
          <>
            <span className="round-number">
              <span className="round-label">Гамбашар </span>
              {round.roundNumber}
            </span>
            <div className="history-result-row">
              <strong className={round.isChatWinner ? 'chat-winner' : ''}>
                {round.winner}
              </strong>
              <span className="history-amount">
                {formatTenths(round.winningRubTenths)} RUB
              </span>
            </div>
            <span className="merged-history-expand-indicator" aria-hidden="true">
              {expandable && (
                <span className={`chevron${expanded ? ' open' : ''}`} />
              )}
            </span>
          </>
        )

        return (
          <li
            key={round.result?.id ?? `round-${round.roundNumber}`}
            className={
              round.roundNumber === newestRoundNumber
                ? 'latest-winner'
                : 'previous-winner'
            }
          >
            {expandable ? (
              <button
                className="merged-history-summary"
                type="button"
                aria-expanded={expanded}
                aria-label={`Гамбашар ${round.roundNumber}: ${round.winner}, ${formatTenths(round.winningRubTenths)} RUB. ${expanded ? 'Скрыть участников' : 'Показать участников'}`}
                onClick={() => toggleRound(round.roundNumber)}
              >
                {summary}
              </button>
            ) : (
              <div className="merged-history-summary">{summary}</div>
            )}
            {expanded && round.participants && (
              <div className="merged-history-participants">
                <ConsumedRoundDetails group={round.participants} />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

interface WinnerHistoryDialogProps {
  rounds: MergedRound[]
  onClose: () => void
  onClear: () => void
}

function WinnerHistoryDialog({ rounds, onClose, onClear }: WinnerHistoryDialogProps) {
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
          <h2 id="winner-history-dialog-title">История победителей</h2>
          <div className="winner-history-dialog-actions">
            {rounds.length > 0 && (
              <button
                className="text-button danger-text"
                type="button"
                onClick={onClear}
              >
                Очистить историю
              </button>
            )}
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
        </div>
        {rounds.length === 0 ? (
          <div className="history-empty history-dialog-empty">
            <span aria-hidden="true">◎</span>
            <p>Здесь появятся результаты и участники завершённых раундов.</p>
          </div>
        ) : (
          <HistoryList rounds={rounds} />
        )}
      </div>
    </div>
  )
}

export function RoundHistory({
  history,
  entries = [],
  settings = DEFAULT_SETTINGS,
  onClear,
}: RoundHistoryProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const rounds = useMemo(
    () => mergeRoundHistory(history, entries, settings),
    [entries, history, settings],
  )
  const lastWinner = rounds[0]

  const closeDialog = () => {
    setDialogOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <>
      <aside className="panel history-card" aria-labelledby="history-title">
        <div className="history-heading">
          <button
            ref={triggerRef}
            className="history-toggle"
            type="button"
            aria-haspopup="dialog"
            onClick={() => setDialogOpen(true)}
          >
            <span className="history-toggle-title" id="history-title">
              История победителей
            </span>
            {lastWinner ? (
              <span className="history-last-winner">
                <span className="history-last-winner-label">Последний победитель</span>
                <span className="history-last-winner-result">
                  <strong className={lastWinner.isChatWinner ? 'chat-winner' : ''}>
                    {lastWinner.winner}
                  </strong>
                  <span className="history-last-winner-separator" aria-hidden="true" />
                  <span className="history-last-winner-amount">
                    {formatTenths(lastWinner.winningRubTenths)} RUB
                  </span>
                </span>
              </span>
            ) : (
              <span className="history-last-winner">Победителей пока нет</span>
            )}
            <span className="history-popup-indicator" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
              </svg>
            </span>
          </button>
        </div>
      </aside>

      {dialogOpen && (
        <WinnerHistoryDialog
          rounds={rounds}
          onClose={closeDialog}
          onClear={() => {
            setDialogOpen(false)
            onClear()
          }}
        />
      )}
    </>
  )
}
