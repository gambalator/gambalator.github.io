import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, type CSSProperties, type FormEvent } from 'react'
import {
  convertToRubTenths,
  formatTenths,
  parseTenths,
} from '../domain/money'
import type { ContributionEntry, Currency, Settings } from '../types'

interface EntryListProps {
  entries: ContributionEntry[]
  settings: Settings
  onUpdate: (entry: ContributionEntry) => void
  onRemove: (id: string) => void
  onReorder: (activeId: string, overId: string) => void
}

function referenceText(entry: ContributionEntry): string | null {
  if (entry.sourceReference) {
    const source = entry.sourceReference
    return `Исходная запись: ${formatTenths(source.amountTenths)} ${source.currency} по курсу ${formatTenths(source.rateTenths)}`
  }
  if (entry.currency !== 'RUB' && entry.appliedRateTenths) {
    return `Курс расчёта: ${formatTenths(entry.appliedRateTenths)}`
  }
  return null
}

function rubEquivalent(entry: ContributionEntry, settings: Settings): number {
  return (
    entry.frozenRubTenths ??
    convertToRubTenths(entry.amountTenths, entry.currency, settings)
  )
}

function ConsumedRow({
  entry,
  settings,
  position,
}: {
  entry: ContributionEntry
  settings: Settings
  position: number
}) {
  const reference = referenceText(entry)
  const equivalent = rubEquivalent(entry, settings)

  return (
    <div className="entry-row consumed-row">
      <div className="status-cell">
        <span className="row-index">{position}</span>
        <span className="status-dot" aria-hidden="true" />
        <span className="sr-only">Использованная запись</span>
      </div>
      <div className="name-cell">{entry.nickname}</div>
      <div className="money-cell">
        <strong>
          {formatTenths(entry.amountTenths)} {entry.currency}
        </strong>
        {(entry.currency !== 'RUB' || reference) && (
          <small>≈ {formatTenths(equivalent)} RUB</small>
        )}
        {reference && <small>{reference}</small>}
      </div>
      <div className="round-cell">Гамбашар {entry.roundNumber}</div>
      <div className="locked-cell" aria-label="Запись заблокирована">
        <span aria-hidden="true">●</span>
      </div>
    </div>
  )
}

interface SortableRowProps {
  entry: ContributionEntry
  settings: Settings
  position: number
  onUpdate: (entry: ContributionEntry) => void
  onRemove: (id: string) => void
}

function SortableRow({
  entry,
  settings,
  position,
  onUpdate,
  onRemove,
}: SortableRowProps) {
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState(entry.nickname)
  const [amount, setAmount] = useState(formatTenths(entry.amountTenths))
  const [currency, setCurrency] = useState<Currency>(entry.currency)
  const [error, setError] = useState('')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const cancelEdit = () => {
    setNickname(entry.nickname)
    setAmount(formatTenths(entry.amountTenths))
    setCurrency(entry.currency)
    setError('')
    setEditing(false)
  }

  const saveEdit = (event: FormEvent) => {
    event.preventDefault()
    const amountTenths = parseTenths(amount)
    if (!nickname.trim() || amountTenths === null || amountTenths <= 0) {
      setError('Проверьте никнейм и сумму.')
      return
    }

    onUpdate({
      id: entry.id,
      nickname: nickname.trim(),
      amountTenths,
      currency,
      status: 'active',
    })
    setError('')
    setEditing(false)
  }

  const equivalent = rubEquivalent(entry, settings)
  const reference = referenceText(entry)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`entry-row active-row${isDragging ? ' dragging' : ''}`}
    >
      {editing ? (
        <form className="edit-row-form" onSubmit={saveEdit}>
          <span className="row-index edit-index">{position}</span>
          <div>
            <label className="sr-only" htmlFor={`edit-name-${entry.id}`}>
              Никнейм
            </label>
            <input
              id={`edit-name-${entry.id}`}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              autoFocus
            />
          </div>
          <div className="edit-money-fields">
            <label className="sr-only" htmlFor={`edit-amount-${entry.id}`}>
              Сумма
            </label>
            <input
              id={`edit-amount-${entry.id}`}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
            />
            <label className="sr-only" htmlFor={`edit-currency-${entry.id}`}>
              Валюта
            </label>
            <select
              id={`edit-currency-${entry.id}`}
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
            >
              <option value="RUB">RUB</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
            {error && <small className="field-error">{error}</small>}
          </div>
          <div className="edit-actions">
            <button className="icon-button save" type="submit" aria-label="Сохранить">
              ✓
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Отменить"
              onClick={cancelEdit}
            >
              ×
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="reorder-cell">
            <span className="row-index">{position}</span>
            <button
              className="drag-handle"
              type="button"
              aria-label={`Изменить порядок записи ${entry.nickname}`}
              {...attributes}
              {...listeners}
            >
              <span aria-hidden="true">⠿</span>
            </button>
          </div>
          <div className="name-cell">{entry.nickname}</div>
          <div className="money-cell">
            <strong>
              {formatTenths(entry.amountTenths)} {entry.currency}
            </strong>
            {entry.currency !== 'RUB' && (
              <small>≈ {formatTenths(equivalent)} RUB</small>
            )}
            {reference && <small>{reference}</small>}
          </div>
          <div className="row-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Изменить запись ${entry.nickname}`}
            >
              ✎
            </button>
            <button
              className="icon-button danger-icon"
              type="button"
              onClick={() => onRemove(entry.id)}
              aria-label={`Удалить запись ${entry.nickname}`}
            >
              ×
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function EntryList({
  entries,
  settings,
  onUpdate,
  onRemove,
  onReorder,
}: EntryListProps) {
  const [usedExpanded, setUsedExpanded] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const consumed = entries.filter((entry) => entry.status === 'consumed')
  const active = entries
    .filter((entry) => entry.status === 'active')
    .reverse()

  const endDrag = ({ active: dragged, over }: DragEndEvent) => {
    if (over && dragged.id !== over.id) {
      onReorder(String(dragged.id), String(over.id))
    }
  }

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">＋</span>
        <strong>Список пока пуст</strong>
        <p>Добавьте первый взнос с помощью формы выше.</p>
      </div>
    )
  }

  return (
    <div className="entry-list">
      {active.length > 0 && (
        <div className="entry-section">
          <div className="list-section-title active-title">
            <span>Активные записи</span>
            <span>{active.length}</span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={endDrag}
          >
            <SortableContext
              items={active.map((entry) => entry.id)}
              strategy={verticalListSortingStrategy}
            >
              {active.map((entry, index) => (
                <SortableRow
                  key={entry.id}
                  entry={entry}
                  settings={settings}
                  position={active.length - index}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {consumed.length > 0 && (
        <div className="entry-section used-section">
          <button
            className="list-section-title used-toggle"
            type="button"
            aria-expanded={usedExpanded}
            onClick={() => setUsedExpanded((value) => !value)}
          >
            <span>Использованные записи</span>
            <span className="used-toggle-meta">
              {consumed.length}
              <span className={`chevron${usedExpanded ? ' open' : ''}`} aria-hidden="true">⌄</span>
            </span>
          </button>
          {usedExpanded && consumed.map((entry, index) => (
            <ConsumedRow
              key={entry.id}
              entry={entry}
              settings={settings}
              position={index + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
