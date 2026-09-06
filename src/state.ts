import type {
  AppState,
  ContributionEntry,
  RoundResult,
  Settings,
} from './types'

export type AppAction =
  | { type: 'settings/update'; settings: Settings }
  | { type: 'entry/add'; entry: ContributionEntry }
  | { type: 'entries/import'; entries: ContributionEntry[] }
  | { type: 'entry/update'; entry: ContributionEntry }
  | { type: 'entry/remove'; id: string }
  | { type: 'entry/reorder'; activeId: string; overId: string }
  | {
      type: 'calculation/apply'
      entries: ContributionEntry[]
      results: RoundResult[]
    }
  | { type: 'used/clear' }
  | { type: 'entries/clear' }
  | { type: 'history/clear' }

function activeEntries(state: AppState): ContributionEntry[] {
  return state.entries.filter((entry) => entry.status === 'active')
}

function withActiveEntries(
  state: AppState,
  active: ContributionEntry[],
): AppState {
  return {
    ...state,
    entries: [
      ...state.entries.filter((entry) => entry.status === 'consumed'),
      ...active,
    ],
  }
}

interface DonationOrderKey {
  timestamp: number
  externalId: string
}

function donationOrderKey(entry: ContributionEntry): DonationOrderKey | null {
  const reference = entry.importReference
  if (!reference?.donatedAt) return null
  const value = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(reference.donatedAt)
    ? `${reference.donatedAt.replace(' ', 'T')}Z`
    : reference.donatedAt
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  return { timestamp, externalId: reference.externalId }
}

function compareExternalIds(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)
  if (!leftNumeric || !rightNumeric) return left.localeCompare(right)
  const normalizedLeft = left.replace(/^0+(?=\d)/, '')
  const normalizedRight = right.replace(/^0+(?=\d)/, '')
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length - normalizedRight.length
  }
  return normalizedLeft.localeCompare(normalizedRight)
}

function compareDonationOrder(left: DonationOrderKey, right: DonationOrderKey): number {
  return left.timestamp - right.timestamp || compareExternalIds(
    left.externalId,
    right.externalId,
  )
}

function mergeImportedEntries(
  active: ContributionEntry[],
  imported: ContributionEntry[],
): ContributionEntry[] {
  const merged = [...active]

  for (const entry of imported) {
    const entryKey = donationOrderKey(entry)
    if (entryKey === null) {
      merged.push(entry)
      continue
    }

    let lastDonationIndex = -1
    let insertionIndex = -1
    for (let index = 0; index < merged.length; index += 1) {
      const current = merged[index]
      if (!current?.importReference) continue
      lastDonationIndex = index
      const currentKey = donationOrderKey(current)
      if (currentKey !== null && compareDonationOrder(entryKey, currentKey) < 0) {
        insertionIndex = index
        break
      }
    }

    if (insertionIndex < 0) {
      insertionIndex = lastDonationIndex < 0 ? merged.length : lastDonationIndex + 1
    }
    merged.splice(insertionIndex, 0, entry)
  }

  return merged
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'settings/update':
      return { ...state, settings: action.settings }
    case 'entry/add':
      return withActiveEntries(state, [...activeEntries(state), action.entry])
    case 'entries/import': {
      const existingIds = new Set(state.entries.map((entry) => entry.id))
      const existingImports = new Set(
        state.entries.flatMap((entry) =>
          entry.importReference
            ? [`${entry.importReference.provider}:${entry.importReference.externalId}`]
            : [],
        ),
      )
      const imported: ContributionEntry[] = []

      for (const entry of action.entries) {
        const reference = entry.importReference
        const importKey = reference
          ? `${reference.provider}:${reference.externalId}`
          : null
        if (
          existingIds.has(entry.id) ||
          (importKey !== null && existingImports.has(importKey))
        ) {
          continue
        }
        existingIds.add(entry.id)
        if (importKey !== null) existingImports.add(importKey)
        imported.push(entry)
      }

      if (imported.length === 0) return state
      return withActiveEntries(
        state,
        mergeImportedEntries(activeEntries(state), imported),
      )
    }
    case 'entry/update':
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.id === action.entry.id && entry.status === 'active'
            ? action.entry
            : entry,
        ),
      }
    case 'entry/remove':
      return {
        ...state,
        entries: state.entries.filter(
          (entry) => entry.id !== action.id || entry.status === 'consumed',
        ),
      }
    case 'entry/reorder': {
      if (action.activeId === action.overId) return state
      const active = activeEntries(state)
      const from = active.findIndex((entry) => entry.id === action.activeId)
      const to = active.findIndex((entry) => entry.id === action.overId)
      if (from < 0 || to < 0) return state
      const reordered = [...active]
      const [moved] = reordered.splice(from, 1)
      if (!moved) return state
      reordered.splice(to, 0, moved)
      return withActiveEntries(state, reordered)
    }
    case 'calculation/apply':
      return {
        ...state,
        entries: action.entries,
        history: [
          ...state.history.map((result) => ({ ...result, isLatest: false })),
          ...action.results.map((result) => ({ ...result, isLatest: true })),
        ],
      }
    case 'used/clear':
      return {
        ...state,
        entries: state.entries.filter((entry) => entry.status === 'active'),
      }
    case 'entries/clear':
      return { ...state, entries: [] }
    case 'history/clear':
      return { ...state, history: [] }
  }
}
