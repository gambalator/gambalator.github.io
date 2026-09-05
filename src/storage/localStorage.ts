import {
  DEFAULT_STATE,
  type AppState,
  type ContributionEntry,
  type Currency,
  type RoundResult,
  type Settings,
} from '../types'

const STORAGE_KEY = 'gambalator:state'
const LEGACY_STORAGE_KEY = 'gambulator:state'
const SCHEMA_VERSION = 4

interface StoredEnvelope {
  version: number
  state: AppState
}

export interface LoadResult {
  state: AppState
  warning?: string
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isCurrency(value: unknown): value is Currency {
  return value === 'RUB' || value === 'USD' || value === 'EUR'
}

function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Settings>
  return (
    isPositiveSafeInteger(item.roundTargetTenths) &&
    isPositiveSafeInteger(item.eurRateTenths) &&
    isPositiveSafeInteger(item.usdRateTenths)
  )
}

function isEntry(value: unknown): value is ContributionEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ContributionEntry>
  return (
    typeof item.id === 'string' &&
    typeof item.nickname === 'string' &&
    item.nickname.trim().length > 0 &&
    (item.isChat === undefined || typeof item.isChat === 'boolean') &&
    isPositiveSafeInteger(item.amountTenths) &&
    isCurrency(item.currency) &&
    (item.status === 'active' || item.status === 'consumed')
  )
}

function isResult(value: unknown): value is RoundResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RoundResult>
  return (
    typeof item.id === 'string' &&
    isPositiveSafeInteger(item.roundNumber) &&
    typeof item.winner === 'string' &&
    isPositiveSafeInteger(item.winningRubTenths) &&
    isPositiveSafeInteger(item.targetRubTenths) &&
    (item.isLatest === undefined || typeof item.isLatest === 'boolean')
  )
}

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<AppState>
  return (
    isSettings(state.settings) &&
    Array.isArray(state.entries) &&
    state.entries.every(isEntry) &&
    Array.isArray(state.history) &&
    state.history.every(isResult)
  )
}

export function loadState(storage: Storage = window.localStorage): LoadResult {
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return { state: DEFAULT_STATE }

    const envelope = JSON.parse(raw) as Partial<StoredEnvelope>
    if (envelope.version === 1 && isAppState(envelope.state)) {
      return { state: envelope.state }
    }

    if (envelope.version === 2 && isAppState(envelope.state)) {
      return {
        state: {
          ...envelope.state,
          entries: [
            ...envelope.state.entries.filter((entry) => entry.status === 'consumed'),
            ...envelope.state.entries
              .filter((entry) => entry.status === 'active')
              .reverse(),
          ],
        },
      }
    }

    if (envelope.version === 3 && isAppState(envelope.state)) {
      return { state: envelope.state }
    }

    if (envelope.version !== SCHEMA_VERSION || !isAppState(envelope.state)) {
      return {
        state: DEFAULT_STATE,
        warning: 'Сохранённые данные повреждены или имеют неизвестную версию. Загружены значения по умолчанию.',
      }
    }

    return { state: envelope.state }
  } catch {
    return {
      state: DEFAULT_STATE,
      warning: 'Не удалось прочитать сохранённые данные. Загружены значения по умолчанию.',
    }
  }
}

export function saveState(
  state: AppState,
  storage: Storage = window.localStorage,
): boolean {
  try {
    const envelope: StoredEnvelope = { version: SCHEMA_VERSION, state }
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}
