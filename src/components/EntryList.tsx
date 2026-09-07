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
  normalizeNickname,
  parseTenths,
} from '../domain/money'
import { CURRENCIES } from '../domain/currencies'
import { displayDonationMoscowTime } from '../domain/moscowTime'
import type { ContributionEntry, Currency, Settings } from '../types'
import { ChatToggle } from './ChatToggle'

interface EntryListProps {
  entries: ContributionEntry[]
  settings: Settings
  onUpdate: (entry: ContributionEntry) => void
  onRemove: (id: string) => void
  onReorder: (activeId: string, overId: string) => void
}

interface UsedEntriesProps {
  entries: ContributionEntry[]
  settings: Settings
}

function referenceText(entry: ContributionEntry): string | null {
  const source = entry.sourceReference
  if (
    source &&
    source.currency !== 'RUB' &&
    source.rateTenths !== undefined
  ) {
    return `Исходная запись: ${formatTenths(source.amountTenths)} ${source.currency} по курсу ${source.rateUnits ?? 1} ${source.currency} = ${formatTenths(source.rateTenths)} RUB`
  }
  if (entry.currency !== 'RUB' && entry.appliedRateTenths) {
    return `Курс расчёта: ${entry.appliedRateUnits ?? 1} ${entry.currency} = ${formatTenths(entry.appliedRateTenths)} RUB`
  }
  return null
}

function originalDonationText(entry: ContributionEntry): string | null {
  const source = entry.sourceReference
  if (!source) return null
  return `Исходный донат: ${formatTenths(source.amountTenths)} ${source.currency}`
}

function rubEquivalent(entry: ContributionEntry, settings: Settings): number {
  return (
    entry.frozenRubTenths ??
    convertToRubTenths(entry.amountTenths, entry.currency, settings)
  )
}

function attributedNickname(entry: ContributionEntry): string {
  return entry.isChat ? 'Chat' : entry.nickname
}

function winnerKeysFor(
  items: Array<{ entry: ContributionEntry; position: number }>,
  settings: Settings,
): Set<string> {
  const totals = new Map<string, number>()

  for (const { entry } of items) {
    const key = normalizeNickname(attributedNickname(entry))
    totals.set(key, (totals.get(key) ?? 0) + rubEquivalent(entry, settings))
  }

  const largest = Math.max(...totals.values())
  return new Set(
    [...totals.entries()]
      .filter(([, total]) => total === largest)
      .map(([key]) => key),
  )
}

function ConsumedRow({
  entry,
  position,
  isWinner,
}: {
  entry: ContributionEntry
  position: number
  isWinner: boolean
}) {
  const reference = referenceText(entry)
  const originalDonation = originalDonationText(entry)

  return (
    <div className={`entry-row consumed-row${entry.isChat ? ' chat-consumed' : ''}`}>
      <div className="status-cell">
        <span className="row-index">{position}</span>
        <span className="sr-only">Использованная запись</span>
      </div>
      <div className={`name-cell${isWinner ? ' round-winner' : ''}`}>
        <span>{entry.nickname}</span>
        {entry.isChat && <span className="chat-history-badge">Chat</span>}
      </div>
      <div className="money-cell">
        <strong>
          {formatTenths(entry.amountTenths)} {entry.currency}
        </strong>
        {originalDonation && (
          <small className="original-donation">{originalDonation}</small>
        )}
        {reference && <small>{reference}</small>}
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
  const [isChat, setIsChat] = useState(entry.isChat === true)
  const [error, setError] = useState('')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const beginEdit = () => {
    setNickname(entry.nickname)
    setAmount(formatTenths(entry.amountTenths))
    setCurrency(entry.currency)
    setIsChat(entry.isChat === true)
    setError('')
    setEditing(true)
  }

  const cancelEdit = () => {
    setNickname(entry.nickname)
    setAmount(formatTenths(entry.amountTenths))
    setCurrency(entry.currency)
    setIsChat(entry.isChat === true)
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
      isChat,
      amountTenths,
      currency,
      status: 'active',
      importReference: entry.importReference,
    })
    setError('')
    setEditing(false)
  }

  const equivalent = rubEquivalent(entry, settings)
  const originalDonation = originalDonationText(entry)
  const donationTime = entry.importReference?.donatedAt
    ? displayDonationMoscowTime(entry.importReference.donatedAt)
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`entry-row active-row${entry.isChat ? ' chat-attributed' : ''}${isDragging ? ' dragging' : ''}`}
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
              {CURRENCIES.map((option) => (
                <option value={option} key={option}>{option}</option>
              ))}
            </select>
            {error && <small className="field-error">{error}</small>}
          </div>
          <ChatToggle
            checked={isChat}
            compact
            label={`Считать донат ${entry.nickname} как донат от Chat`}
            onChange={setIsChat}
          />
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
          <div className="name-cell">
            <span className="entry-nickname">{entry.nickname}</span>
            {donationTime && <small className="donation-time">{donationTime}</small>}
          </div>
          <div className="money-cell">
            <strong>
              {formatTenths(entry.amountTenths)} {entry.currency}
            </strong>
            {originalDonation && (
              <small className="original-donation">{originalDonation}</small>
            )}
            {entry.currency !== 'RUB' && (
              <small>≈ {formatTenths(equivalent)} RUB</small>
            )}
          </div>
          <ChatToggle
            checked={entry.isChat === true}
            compact
            label={`Считать донат ${entry.nickname} как донат от Chat`}
            onChange={(isChat) => onUpdate({ ...entry, isChat })}
          />
          <div className="row-actions">
            <button
              className="icon-button"
              type="button"
              onClick={beginEdit}
              aria-label={`Изменить запись ${entry.nickname}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                <path d="m13.5 6.5 4 4" />
              </svg>
            </button>
            <button
              className="icon-button danger-icon"
              type="button"
              onClick={() => onRemove(entry.id)}
              aria-label={`Удалить запись ${entry.nickname}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M9 7V4h6v3" />
                <path d="m6 7 1 13h10l1-13" />
                <path d="M10 11v5M14 11v5" />
              </svg>
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const active = entries
    .filter((entry) => entry.status === 'active')
    .reverse()

  const endDrag = ({ active: dragged, over }: DragEndEvent) => {
    if (over && dragged.id !== over.id) {
      onReorder(String(dragged.id), String(over.id))
    }
  }

  if (active.length === 0) {
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

    </div>
  )
}

export function UsedEntries({ entries, settings }: UsedEntriesProps) {
  const [expanded, setExpanded] = useState(false)
  const consumed = entries.filter((entry) => entry.status === 'consumed')
  const groupsByRound = new Map<
    number,
    Array<{ entry: ContributionEntry; position: number }>
  >()

  consumed.forEach((entry, index) => {
    const roundNumber = entry.roundNumber ?? 0
    const item = { entry, position: index + 1 }
    groupsByRound.set(roundNumber, [...(groupsByRound.get(roundNumber) ?? []), item])
  })

  const groupedByRound = [...groupsByRound.entries()]
    .map(([roundNumber, items]) => ({
      roundNumber,
      items,
      winnerKeys: winnerKeysFor(items, settings),
    }))
    .sort((first, second) => second.roundNumber - first.roundNumber)

  if (consumed.length === 0) return null

  return (
    <div className="entry-section used-section">
      <button
        className="list-section-title used-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>ИСТОРИЯ</span>
        <span className="used-toggle-meta">
          {groupedByRound.length}
          <span className={`chevron${expanded ? ' open' : ''}`} aria-hidden="true">⌄</span>
        </span>
      </button>
      {expanded &&
        groupedByRound.map((group) => (
          <div className="used-round-group" key={group.roundNumber}>
            <div className="used-round-heading">
              Гамбашар {group.roundNumber}
            </div>
            {group.items.map(({ entry, position }) => (
              <ConsumedRow
                key={entry.id}
                entry={entry}
                position={position}
                isWinner={group.winnerKeys.has(
                  normalizeNickname(attributedNickname(entry)),
                )}
              />
            ))}
          </div>
        ))}
    </div>
  )
}
