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
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import {
  convertToRubTenths,
  formatTenths,
  normalizeNickname,
  parseTenths,
} from '../domain/money'
import { CURRENCIES } from '../domain/currencies'
import {
  consumedRoundGroupsFor,
  type ConsumedRoundGroup,
} from '../domain/consumedRounds'
import { activeIdsAfterDisplayMove } from '../domain/displayGroups'
import { displayDonationMoscowTime } from '../domain/moscowTime'
import {
  loadEntryListGroupingState,
  saveEntryListGroupingState,
  type StoredVisualGroup,
} from '../storage/entryListGrouping'
import type { ContributionEntry, Currency, Settings } from '../types'
import { ChatToggle } from './ChatToggle'

interface EntryListProps {
  entries: ContributionEntry[]
  settings: Settings
  persistenceReady?: boolean
  onUpdate: (entry: ContributionEntry) => void
  onRemove: (id: string | string[]) => void
  onReorder: (activeIds: string[]) => void
}

interface UsedEntriesProps {
  entries: ContributionEntry[]
  settings: Settings
  displayMode?: 'collapsible' | 'dialog'
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

function gambasharCountLabel(count: number): string {
  const lastTwoDigits = count % 100
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'гамбашаров'
  const lastDigit = count % 10
  if (lastDigit === 1) return 'гамбашар'
  if (lastDigit >= 2 && lastDigit <= 4) return 'гамбашара'
  return 'гамбашаров'
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
  nextRound: boolean
  onUpdate: (entry: ContributionEntry) => void
  onRemove: (id: string) => void
  selectionMode: boolean
  selected: boolean
  onSelectionChange: (selected: boolean) => void
}

export function ConsumedRoundDetails({
  group,
}: {
  group: ConsumedRoundGroup
}) {
  return (
    <div className="consumed-round-details">
      {group.items.map(({ entry, position }) => (
        <ConsumedRow
          key={entry.id}
          entry={entry}
          position={position}
          isWinner={entry.isChat
            ? group.chatWins
            : group.individualKeys.has(normalizeNickname(entry.nickname))}
        />
      ))}
    </div>
  )
}

function SortableRow({
  entry,
  settings,
  position,
  nextRound,
  onUpdate,
  onRemove,
  selectionMode,
  selected,
  onSelectionChange,
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

    const updatedEntry: ContributionEntry = {
      ...entry,
      id: entry.id,
      nickname: nickname.trim(),
      isChat,
      amountTenths,
      currency,
      status: 'active',
    }
    if (amountTenths !== entry.amountTenths || currency !== entry.currency) {
      delete updatedEntry.frozenRubTenths
      delete updatedEntry.appliedRateTenths
      delete updatedEntry.appliedRateUnits
    }
    onUpdate(updatedEntry)
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
      className={`entry-row active-row${entry.isChat ? ' chat-attributed' : ''}${nextRound ? ' next-round-entry' : ''}${isDragging ? ' dragging' : ''}`}
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
            {selectionMode && (
              <input
                className="merge-selection-checkbox"
                type="checkbox"
                checked={selected}
                aria-label={`Выбрать донат ${entry.nickname} для объединения`}
                onChange={(event) => onSelectionChange(event.target.checked)}
              />
            )}
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

interface DisplayEntryItem {
  kind: 'entry'
  id: string
  entry: ContributionEntry
  position: number
}

interface DisplayGroupItem {
  kind: 'group'
  id: string
  entries: ContributionEntry[]
  positions: number[]
  automatic: boolean
  name: string
}

type DisplayItem = DisplayEntryItem | DisplayGroupItem

type VisualGroup = StoredVisualGroup

function displayMergeKey(entry: ContributionEntry): string {
  return entry.isChat === true
    ? 'chat'
    : `nickname:${normalizeNickname(entry.nickname)}`
}

function donationGroupCountLabel(count: number): string {
  const lastTwoDigits = count % 100
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} донатов`
  const lastDigit = count % 10
  if (lastDigit === 1) return `${count} донат`
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} доната`
  return `${count} донатов`
}

function normalizeVisualGroups(
  groups: VisualGroup[],
  entries: ContributionEntry[],
): VisualGroup[] {
  const activeById = new Map(
    entries.map((entry, index) => [entry.id, { entry, index }]),
  )
  const claimedIds = new Set<string>()

  return groups.flatMap((group) => {
    const members = group.memberIds
      .map((id) => activeById.get(id))
      .filter((item): item is { entry: ContributionEntry; index: number } => Boolean(item))
      .sort((left, right) => left.index - right.index)
    const valid = (
      members.length >= 2 &&
      members.every((member, index) => index === 0 || member.index === members[index - 1]!.index + 1) &&
      members.every((member) =>
        (member.entry.isChat === true) === (members[0]!.entry.isChat === true)) &&
      members.every((member) => !claimedIds.has(member.entry.id))
    )
    if (!valid) return []
    const memberIds = members.map((member) => member.entry.id)
    memberIds.forEach((id) => claimedIds.add(id))
    return [{ ...group, memberIds }]
  })
}

function visualGroupsEqual(left: VisualGroup[], right: VisualGroup[]): boolean {
  return left.length === right.length && left.every((group, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      group.id === other.id &&
      group.automatic === other.automatic &&
      group.name === other.name &&
      group.memberIds.length === other.memberIds.length &&
      group.memberIds.every((id, memberIndex) => id === other.memberIds[memberIndex])
    )
  })
}

function materializeAutomaticGroups(
  entries: ContributionEntry[],
  currentGroups: VisualGroup[],
  exclusions: Set<string>,
): VisualGroup[] {
  const groups = normalizeVisualGroups(currentGroups, entries)
  const groupByMember = new Map<string, VisualGroup>()
  groups.forEach((group) => {
    group.memberIds.forEach((id) => groupByMember.set(id, group))
  })
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  const tokens: Array<{
    entries: ContributionEntry[]
    group?: VisualGroup
    key: string | null
    excluded: boolean
  }> = []

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (!entry) continue
    const group = groupByMember.get(entry.id)
    if (group) {
      if (group.memberIds[0] !== entry.id) continue
      const groupedEntries = group.memberIds
        .map((id) => entryById.get(id))
        .filter((member): member is ContributionEntry => Boolean(member))
      const firstKey = displayMergeKey(groupedEntries[0]!)
      tokens.push({
        entries: groupedEntries,
        group,
        key: groupedEntries.every((member) => displayMergeKey(member) === firstKey)
          ? firstKey
          : null,
        excluded: groupedEntries.some((member) => exclusions.has(member.id)),
      })
      index += groupedEntries.length - 1
      continue
    }
    tokens.push({
      entries: [entry],
      key: displayMergeKey(entry),
      excluded: exclusions.has(entry.id),
    })
  }

  const materialized: VisualGroup[] = []
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index]
    if (!token) break
    if (token.key === null || token.excluded) {
      if (token.group) materialized.push(token.group)
      index += 1
      continue
    }

    const run = [token]
    let nextIndex = index + 1
    while (nextIndex < tokens.length) {
      const next = tokens[nextIndex]
      if (!next || next.excluded || next.key !== token.key) break
      run.push(next)
      nextIndex += 1
    }
    const memberEntries = run.flatMap((item) => item.entries)
    const existing = run.find((item) => item.group)?.group
    if (memberEntries.length >= 2) {
      materialized.push(existing ? {
        ...existing,
        memberIds: memberEntries.map((member) => member.id),
        name: token.key === 'chat' ? 'Chat' : existing.name,
      } : {
        id: `auto:${memberEntries[0]!.id}`,
        memberIds: memberEntries.map((member) => member.id),
        automatic: true,
        name: token.key === 'chat' ? 'Chat' : memberEntries[0]!.nickname,
      })
    } else if (existing) {
      materialized.push(existing)
    }
    index = nextIndex
  }

  return materialized
}

function GroupedDonationRow({
  entry,
  position,
  settings,
  nextRound,
}: {
  entry: ContributionEntry
  position: number
  settings: Settings
  nextRound: boolean
}) {
  const equivalent = rubEquivalent(entry, settings)
  const originalDonation = originalDonationText(entry)
  const donationTime = entry.importReference?.donatedAt
    ? displayDonationMoscowTime(entry.importReference.donatedAt)
    : null

  return (
    <div className={`entry-row grouped-donation-row${entry.isChat ? ' chat-attributed' : ''}${nextRound ? ' next-round-entry' : ''}`}>
      <span className="row-index">{position}</span>
      <div className="name-cell">
        <span className="entry-nickname">{entry.nickname}</span>
        {donationTime && <small className="donation-time">{donationTime}</small>}
      </div>
      <div className="money-cell">
        <strong>{formatTenths(entry.amountTenths)} {entry.currency}</strong>
        {originalDonation && <small className="original-donation">{originalDonation}</small>}
        {entry.currency !== 'RUB' && <small>≈ {formatTenths(equivalent)} RUB</small>}
      </div>
      <span className={`grouped-attribution${entry.isChat ? ' chat' : ''}`}>
        {entry.isChat ? 'Chat' : 'Обычный'}
      </span>
    </div>
  )
}

function MergedRow({
  item,
  settings,
  position,
  nextRoundEntryIds,
  expanded,
  onToggleExpanded,
  onRename,
  onUnmerge,
  onRemove,
}: {
  item: DisplayGroupItem
  settings: Settings
  position: number
  nextRoundEntryIds: ReadonlySet<string>
  expanded: boolean
  onToggleExpanded: () => void
  onRename: (name: string) => void
  onUnmerge: () => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(item.name)
  const allChat = item.entries.every((entry) => entry.isChat === true)
  const contributesToNextRound = item.entries.some((entry) =>
    nextRoundEntryIds.has(entry.id))
  const nickname = allChat ? 'Chat' : item.name
  const totalRubTenths = item.entries.reduce(
    (total, entry) => total + rubEquivalent(entry, settings),
    0,
  )
  const firstPosition = Math.min(...item.positions)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const saveName = () => {
    const nextName = draftName.trim()
    if (!nextName || allChat) return
    onRename(nextName)
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`merged-group${expanded ? ' expanded' : ''}${isDragging ? ' dragging' : ''}`}
    >
      <div className={`entry-row active-row merged-row${allChat ? ' chat-attributed' : ''}${contributesToNextRound && !expanded ? ' next-round-entry' : ''}`}>
        <div className="reorder-cell">
          <span className="row-index">{position}</span>
          <button
            className="drag-handle"
            type="button"
            aria-label={`Изменить порядок группы ${nickname}`}
            {...attributes}
            {...listeners}
          >
            <span aria-hidden="true">⠿</span>
          </button>
          <button
            className="group-expand-toggle merged-expand-button"
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Свернуть' : 'Раскрыть'} группу ${nickname}`}
            disabled={editing}
            onClick={onToggleExpanded}
          >
            <span className={`chevron${expanded ? ' open' : ''}`} aria-hidden="true" />
          </button>
        </div>
        {editing ? (
          <div className="name-cell merged-name-cell editing">
            <label className="sr-only" htmlFor={`group-name-${item.id}`}>
              Название группы
            </label>
            <input
              id={`group-name-${item.id}`}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              autoFocus
            />
            <small>{donationGroupCountLabel(item.entries.length)}</small>
          </div>
        ) : (
          <div
            className="name-cell merged-name-cell"
            onClick={onToggleExpanded}
          >
            <span className="entry-nickname">{nickname}</span>
            <small>{donationGroupCountLabel(item.entries.length)}</small>
          </div>
        )}
        <div className="money-cell">
          <strong>{formatTenths(totalRubTenths)} RUB</strong>
          <small>{item.automatic ? 'Автообъединение' : 'Объединённая группа'}</small>
        </div>
        <span className={`grouped-attribution${allChat ? ' chat' : ''}`}>
          {allChat ? 'Chat' : 'Группа'}
        </span>
        <div className="row-actions merged-row-actions">
          {editing ? (
            <>
              <button
                className="icon-button save"
                type="button"
                aria-label="Сохранить название группы"
                onClick={saveName}
              >
                ✓
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Отменить изменение группы"
                onClick={() => {
                  setDraftName(nickname)
                  setEditing(false)
                }}
              >
                ×
              </button>
            </>
          ) : (
            <>
              <button
                className="icon-button"
                type="button"
                disabled={allChat}
                onClick={() => {
                  setDraftName(nickname)
                  setEditing(true)
                }}
                aria-label={`Изменить группу ${nickname}`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                  <path d="m13.5 6.5 4 4" />
                </svg>
              </button>
              <button
                className="icon-button unmerge-icon"
                type="button"
                aria-label={`Разъединить группу ${nickname}`}
                onClick={onUnmerge}
              >
                <span aria-hidden="true">⇱</span>
              </button>
              <button
                className="icon-button danger-icon"
                type="button"
                aria-label={`Удалить группу ${nickname}`}
                onClick={onRemove}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16" />
                  <path d="M9 7V4h6v3" />
                  <path d="m6 7 1 13h10l1-13" />
                  <path d="M10 11v5M14 11v5" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
      {expanded && (
        <div className="grouped-donations" aria-label={`Донаты группы ${nickname}`}>
          {item.entries.map((entry, index) => (
            <GroupedDonationRow
              key={entry.id}
              entry={entry}
              position={item.positions[index] ?? firstPosition + index}
              settings={settings}
              nextRound={nextRoundEntryIds.has(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function EntryList({
  entries,
  settings,
  persistenceReady = true,
  onUpdate,
  onRemove,
  onReorder,
}: EntryListProps) {
  const [initialGrouping] = useState(loadEntryListGroupingState)
  const [newestFirst, setNewestFirst] = useState(false)
  const [autoMerge, setAutoMerge] = useState(initialGrouping.autoMerge)
  const [visualGroups, setVisualGroups] = useState<VisualGroup[]>(
    initialGrouping.groups,
  )
  const [autoMergeExclusions, setAutoMergeExclusions] = useState<Set<string>>(
    () => new Set(initialGrouping.exclusions),
  )
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [groupName, setGroupName] = useState('')
  const [mergeError, setMergeError] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const activeInCalculationOrder = entries.filter(
    (entry) => entry.status === 'active',
  )
  const activeTotalRubTenths = activeInCalculationOrder.reduce(
    (total, entry) => total + rubEquivalent(entry, settings),
    0,
  )
  const availableRounds = settings.roundTargetTenths > 0
    ? Math.floor(activeTotalRubTenths / settings.roundTargetTenths)
    : 0
  const nextRoundEntryIds = new Set<string>()
  if (availableRounds > 0) {
    let accumulatedRubTenths = 0
    for (const entry of activeInCalculationOrder) {
      nextRoundEntryIds.add(entry.id)
      accumulatedRubTenths += rubEquivalent(entry, settings)
      if (accumulatedRubTenths >= settings.roundTargetTenths) break
    }
  }
  const effectiveVisualGroups = autoMerge
    ? materializeAutomaticGroups(
      activeInCalculationOrder,
      visualGroups,
      autoMergeExclusions,
    )
    : normalizeVisualGroups(visualGroups, activeInCalculationOrder)
  const activeIdSet = new Set(activeInCalculationOrder.map((entry) => entry.id))
  const groupingStorageValue = JSON.stringify({
    autoMerge,
    groups: effectiveVisualGroups,
    exclusions: [...autoMergeExclusions].filter((id) => activeIdSet.has(id)),
  })

  useEffect(() => {
    if (!persistenceReady) return
    saveEntryListGroupingState(JSON.parse(groupingStorageValue))
  }, [groupingStorageValue, persistenceReady])

  const activeById = new Map(
    activeInCalculationOrder.map((entry, index) => [entry.id, { entry, index }]),
  )
  const groupByMember = new Map<string, VisualGroup>()
  for (const group of effectiveVisualGroups) {
    for (const id of group.memberIds) groupByMember.set(id, group)
  }

  const canonicalDisplayItems: DisplayItem[] = []
  for (let index = 0; index < activeInCalculationOrder.length; index += 1) {
    const entry = activeInCalculationOrder[index]
    if (!entry) continue
    const visualGroup = groupByMember.get(entry.id)
    if (visualGroup) {
      if (visualGroup.memberIds[0] !== entry.id) continue
      const groupEntries = visualGroup.memberIds
        .map((id) => activeById.get(id))
        .filter((item): item is { entry: ContributionEntry; index: number } => Boolean(item))
      canonicalDisplayItems.push({
        kind: 'group',
        id: visualGroup.id,
        entries: groupEntries.map((item) => item.entry),
        positions: groupEntries.map((item) => item.index + 1),
        automatic: visualGroup.automatic,
        name: visualGroup.name,
      })
      index += groupEntries.length - 1
      continue
    }

    canonicalDisplayItems.push({
      kind: 'entry',
      id: entry.id,
      entry,
      position: index + 1,
    })
  }

  const displayItems = newestFirst
    ? [...canonicalDisplayItems].reverse()
    : canonicalDisplayItems
  const displayRuns = displayItems.reduce<Array<{
    nextRound: boolean
    items: Array<{ item: DisplayItem; displayIndex: number }>
  }>>((runs, item, displayIndex) => {
    const nextRound = item.kind === 'group'
      ? item.entries.some((entry) => nextRoundEntryIds.has(entry.id))
      : nextRoundEntryIds.has(item.entry.id)
    const previousRun = runs[runs.length - 1]
    if (previousRun?.nextRound === nextRound) {
      previousRun.items.push({ item, displayIndex })
    } else {
      runs.push({ nextRound, items: [{ item, displayIndex }] })
    }
    return runs
  }, [])
  const selectedEntriesForMerge = activeInCalculationOrder.filter((entry) =>
    selectedIds.has(entry.id),
  )
  const selectedAllChat = selectedEntriesForMerge.length > 0 &&
    selectedEntriesForMerge.every((entry) => entry.isChat)

  const endDrag = ({ active: dragged, over }: DragEndEvent) => {
    if (!over || dragged.id === over.id) return
    const activeIds = activeIdsAfterDisplayMove(
      displayItems.map((item) => ({
        id: item.id,
        entryIds: item.kind === 'group'
          ? item.entries.map((entry) => entry.id)
          : [item.entry.id],
      })),
      String(dragged.id),
      String(over.id),
      newestFirst,
    )
    if (activeIds) onReorder(activeIds)
  }

  const toggleSelected = (id: string, selected: boolean) => {
    setMergeError('')
    const next = new Set(selectedIds)
    if (selected) next.add(id)
    else next.delete(id)
    const selectedEntries = activeInCalculationOrder.filter((entry) => next.has(entry.id))
    const first = selectedEntries[0]
    setSelectedIds(next)
    setGroupName(
      selectedEntries.length > 0 && selectedEntries.every((entry) => entry.isChat)
        ? 'Chat'
        : first?.nickname ?? '',
    )
  }

  const cancelSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setGroupName('')
    setMergeError('')
  }

  const mergeSelected = () => {
    const selected = activeInCalculationOrder
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => selectedIds.has(entry.id))
    if (selected.length < 2) {
      setMergeError('Выберите минимум два доната.')
      return
    }
    const consecutive = selected.every(
      (item, index) => index === 0 || item.index === selected[index - 1]!.index + 1,
    )
    const chatState = selected[0]!.entry.isChat === true
    const compatible = selected.every(
      ({ entry }) => (entry.isChat === true) === chatState,
    )
    if (!consecutive) {
      setMergeError(
        'Можно объединить только соседние донаты.',
      )
      return
    }
    if (!compatible) {
      setMergeError('Нельзя объединять обычные и Chat-донаты в одну группу.')
      return
    }
    if (!chatState && !groupName.trim()) {
      setMergeError('Введите название группы.')
      return
    }
    const memberIds = selected.map(({ entry }) => entry.id)
    setVisualGroups((current) => [
      ...current.filter((group) =>
        group.memberIds.every((id) => !memberIds.includes(id))),
      {
        id: `manual:${memberIds.join(':')}`,
        memberIds,
        automatic: false,
        name: selected.every(({ entry }) => entry.isChat) ? 'Chat' : groupName.trim(),
      },
    ])
    cancelSelection()
  }

  if (activeInCalculationOrder.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">＋</span>
        <strong>Список пока пуст</strong>
        <p>Добавьте донат кнопкой «+» справа от кнопок расчёта.</p>
      </div>
    )
  }

  return (
    <div className="entry-list">
      {activeInCalculationOrder.length > 0 && (
        <div className="entry-section">
          <div className="list-section-title active-title">
            <span className="active-total">
              <span className="active-sum">
                {formatTenths(activeTotalRubTenths)} RUB
              </span>
              <span className="active-total-separator" aria-hidden="true" />
              <span className="available-rounds">
                <span className="available-round-count">{availableRounds}</span>{' '}
                <span className="available-round-label">
                  {gambasharCountLabel(availableRounds)}
                </span>
              </span>
            </span>
            <div className="active-view-controls">
              <button
                className={`active-auto-merge${autoMerge ? ' enabled' : ''}`}
                type="button"
                aria-pressed={autoMerge}
                onClick={() => {
                  const nextAutoMerge = !autoMerge
                  if (nextAutoMerge) {
                    setAutoMergeExclusions(new Set())
                  } else {
                    setVisualGroups((current) => visualGroupsEqual(
                      current,
                      effectiveVisualGroups,
                    ) ? current : effectiveVisualGroups)
                  }
                  setAutoMerge(nextAutoMerge)
                  cancelSelection()
                }}
              >
                Авто: {autoMerge ? 'вкл' : 'выкл'}
              </button>
              <button
                className="active-merge-button"
                type="button"
                aria-pressed={selectionMode}
                onClick={() => {
                  if (selectionMode) cancelSelection()
                  else {
                    setSelectionMode(true)
                    setMergeError('')
                  }
                }}
              >
                Объединить
              </button>
              <button
                className="active-order-toggle"
                type="button"
                aria-label={newestFirst ? 'Показать сначала старые' : 'Показать сначала новые'}
                title={newestFirst ? 'Показать сначала старые' : 'Показать сначала новые'}
                onClick={() => setNewestFirst((value) => !value)}
              >
                <span aria-hidden="true">⇅</span>
              </button>
            </div>
          </div>
          <div className="section-divider active-summary-divider" aria-hidden="true" />
          {selectionMode && (
            <div className="merge-selection-bar" role="status">
              <span>Выбрано: {selectedIds.size}</span>
              <span>Выберите соседние донаты одного типа: обычные или Chat.</span>
              <label className="merge-name-field">
                <span>Название группы</span>
                <input
                  value={groupName}
                  disabled={selectedAllChat}
                  onChange={(event) => {
                    setGroupName(event.target.value)
                    setMergeError('')
                  }}
                />
              </label>
              {mergeError && <strong>{mergeError}</strong>}
              <button
                className="button secondary merge-selected-button"
                type="button"
                onClick={mergeSelected}
              >
                Объединить выбранные
              </button>
              <button className="text-button" type="button" onClick={cancelSelection}>
                Отмена
              </button>
            </div>
          )}
          <div className="active-records-scroll">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={endDrag}
            >
              <SortableContext
                items={displayItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {displayRuns.map((run) => {
                  const content = run.items.map(({ item, displayIndex }) => item.kind === 'group' ? (
                  <MergedRow
                    key={item.id}
                    item={item}
                    settings={settings}
                    nextRoundEntryIds={nextRoundEntryIds}
                    position={newestFirst
                      ? displayItems.length - displayIndex
                      : displayIndex + 1}
                    expanded={expandedGroupIds.has(item.id)}
                    onToggleExpanded={() => {
                      setExpandedGroupIds((current) => {
                        const next = new Set(current)
                        if (next.has(item.id)) next.delete(item.id)
                        else next.add(item.id)
                        return next
                      })
                    }}
                    onRename={(name) => {
                      setVisualGroups(effectiveVisualGroups.map((group) =>
                        group.id === item.id ? { ...group, name } : group,
                      ))
                    }}
                    onUnmerge={() => {
                      setVisualGroups((current) =>
                        current.filter((group) => group.id !== item.id),
                      )
                      setExpandedGroupIds((current) => {
                        const next = new Set(current)
                        next.delete(item.id)
                        return next
                      })
                      if (autoMerge) {
                        setAutoMergeExclusions((current) => new Set([
                          ...current,
                          ...item.entries.map((entry) => entry.id),
                        ]))
                      }
                    }}
                    onRemove={() => {
                      const memberIds = item.entries.map((entry) => entry.id)
                      setVisualGroups((current) =>
                        current.filter((group) => group.id !== item.id),
                      )
                      setAutoMergeExclusions((current) => new Set([
                        ...current,
                        ...memberIds,
                      ]))
                      onRemove(memberIds)
                    }}
                  />
                ) : (
                  <SortableRow
                    key={item.id}
                    entry={item.entry}
                    settings={settings}
                    nextRound={nextRoundEntryIds.has(item.entry.id)}
                    position={newestFirst
                      ? displayItems.length - displayIndex
                      : displayIndex + 1}
                    onUpdate={onUpdate}
                    onRemove={(id) => onRemove(id)}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(item.id)}
                    onSelectionChange={(selected) => toggleSelected(item.id, selected)}
                  />
                  ))
                  return run.nextRound ? (
                    <div className="next-round-group" key={`next-round-${run.items[0]?.item.id ?? ''}`}>
                      {content}
                    </div>
                  ) : content
                })}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

    </div>
  )
}

export function UsedEntries({
  entries,
  settings,
  displayMode = 'collapsible',
}: UsedEntriesProps) {
  const [expanded, setExpanded] = useState(false)
  const dialogMode = displayMode === 'dialog'
  const consumed = entries.filter((entry) => entry.status === 'consumed')
  const groupedByRound = consumedRoundGroupsFor(entries, settings)

  if (consumed.length === 0) {
    if (!dialogMode) return null
    return (
      <div className="empty-state used-history-empty">
        <span className="empty-icon" aria-hidden="true">◎</span>
        <strong>История пока пуста</strong>
        <p>Здесь появятся записи, использованные в завершённых гамбашарах.</p>
      </div>
    )
  }

  return (
    <div className={`entry-section used-section${dialogMode ? ' used-section-dialog' : ''}`}>
      {!dialogMode && (
        <button
          className="list-section-title used-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span>ИСТОРИЯ</span>
          <span className="used-toggle-meta">
            {groupedByRound.length}
            <span className={`chevron${expanded ? ' open' : ''}`} aria-hidden="true" />
          </span>
        </button>
      )}
      {(dialogMode || expanded) && (
        <div className="used-history-scroll">
          {groupedByRound.map((group) => (
            <div className="used-round-group" key={group.roundNumber}>
              <div className="used-round-heading">
                Гамбашар {group.roundNumber}
              </div>
              <ConsumedRoundDetails group={group} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
