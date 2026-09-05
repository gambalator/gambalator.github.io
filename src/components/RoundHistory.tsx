import { formatTenths } from '../domain/money'
import type { RoundResult } from '../types'

interface RoundHistoryProps {
  history: RoundResult[]
  onClear: () => void
}

export function RoundHistory({ history, onClear }: RoundHistoryProps) {
  return (
    <aside className="history-card" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <p className="eyebrow">Результаты</p>
          <h3 id="history-title">История победителей</h3>
        </div>
        {history.length > 0 && (
          <button className="text-button" type="button" onClick={onClear}>
            Очистить историю
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="history-empty">
          <span aria-hidden="true">◎</span>
          <p>Здесь появятся победители завершённых раундов.</p>
        </div>
      ) : (
        <ol className="history-list">
          {history.map((result, index) => (
            <li key={result.id}>
              <span className="history-index">{index + 1}</span>
              <span className="round-number">Гамбашар {result.roundNumber}</span>
              <strong className={result.winner === 'Chat' ? 'chat-winner' : ''}>
                {result.winner}
              </strong>
              <span>{formatTenths(result.winningRubTenths)} RUB</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
