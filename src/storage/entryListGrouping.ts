export interface StoredVisualGroup {
  id: string
  memberIds: string[]
  automatic: boolean
  name: string
}

export interface EntryListGroupingState {
  autoMerge: boolean
  groups: StoredVisualGroup[]
  exclusions: string[]
}

const STORAGE_KEY = 'gambalator:entry-list-grouping:v1'

const EMPTY_STATE: EntryListGroupingState = {
  autoMerge: true,
  groups: [],
  exclusions: [],
}

function isVisualGroup(value: unknown): value is StoredVisualGroup {
  if (typeof value !== 'object' || value === null) return false
  const group = value as Partial<StoredVisualGroup>
  return (
    typeof group.id === 'string' &&
    /^(manual|auto):/.test(group.id) &&
    Array.isArray(group.memberIds) &&
    group.memberIds.length >= 2 &&
    group.memberIds.every((id) => typeof id === 'string' && id.length > 0) &&
    new Set(group.memberIds).size === group.memberIds.length &&
    typeof group.automatic === 'boolean' &&
    typeof group.name === 'string' &&
    group.name.trim().length > 0
  )
}

export function loadEntryListGroupingState(): EntryListGroupingState {
  if (typeof window === 'undefined') return EMPTY_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    const value = JSON.parse(raw) as Record<string, unknown>
    if (
      value.version !== 1 ||
      typeof value.autoMerge !== 'boolean' ||
      !Array.isArray(value.groups) ||
      !value.groups.every(isVisualGroup) ||
      !Array.isArray(value.exclusions) ||
      !value.exclusions.every((id) => typeof id === 'string')
    ) return EMPTY_STATE
    return {
      autoMerge: value.autoMerge,
      groups: value.groups.map((group) => ({
        ...group,
        memberIds: [...group.memberIds],
        name: group.name.trim(),
      })),
      exclusions: [...new Set(value.exclusions)],
    }
  } catch {
    return EMPTY_STATE
  }
}

export function saveEntryListGroupingState(state: EntryListGroupingState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      ...state,
    }))
  } catch {
    // Grouping is a UI convenience; storage failures must not block the calculator.
  }
}
