import {
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  type AppState,
  type ContributionEntry,
  type ImportReference,
  type RoundResult,
  type Settings,
} from '../types'
import { isCurrency } from '../domain/currencies'

const STORAGE_KEY = 'gambalator:state'
const LEGACY_STORAGE_KEY = 'gambulator:state'
const SCHEMA_VERSION = 6

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

function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Settings>
  return (
    isPositiveSafeInteger(item.roundTargetTenths) &&
    isPositiveSafeInteger(item.eurRateTenths) &&
    isPositiveSafeInteger(item.usdRateTenths) &&
    isPositiveSafeInteger(item.bynRateTenths) &&
    isPositiveSafeInteger(item.kztRateTenths) &&
    isPositiveSafeInteger(item.uahRateTenths) &&
    isPositiveSafeInteger(item.brlRateTenths) &&
    isPositiveSafeInteger(item.tryRateTenths)
  )
}

function hasLegacySettings(value: unknown): value is Partial<Settings> & {
  roundTargetTenths: number
  eurRateTenths: number
  usdRateTenths: number
} {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Settings>
  return (
    isPositiveSafeInteger(item.roundTargetTenths) &&
    isPositiveSafeInteger(item.eurRateTenths) &&
    isPositiveSafeInteger(item.usdRateTenths)
  )
}

function isImportReference(value: unknown): value is ImportReference {
  if (!value || typeof value !== 'object') return false
  const reference = value as Partial<ImportReference>
  return (
    reference.provider === 'donationalerts' &&
    typeof reference.externalId === 'string' &&
    reference.externalId.length > 0 &&
    (reference.donatedAt === null || typeof reference.donatedAt === 'string')
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
    (item.importReference === undefined || isImportReference(item.importReference)) &&
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

function migrateLegacyState(value: unknown): AppState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<AppState>
  if (
    !hasLegacySettings(state.settings) ||
    !Array.isArray(state.entries) ||
    !state.entries.every(isEntry) ||
    !Array.isArray(state.history) ||
    !state.history.every(isResult)
  ) {
    return null
  }
  return {
    settings: { ...DEFAULT_SETTINGS, ...state.settings },
    entries: state.entries,
    history: state.history,
  }
}

export function loadState(storage: Storage = window.localStorage): LoadResult {
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return { state: DEFAULT_STATE }

    const envelope = JSON.parse(raw) as Partial<StoredEnvelope>
    const migratedState = migrateLegacyState(envelope.state)
    if (envelope.version === 1 && migratedState) {
      return { state: migratedState }
    }

    if (envelope.version === 2 && migratedState) {
      return {
        state: {
          ...migratedState,
          entries: [
            ...migratedState.entries.filter((entry) => entry.status === 'consumed'),
            ...migratedState.entries
              .filter((entry) => entry.status === 'active')
              .reverse(),
          ],
        },
      }
    }

    if (envelope.version === 3 && migratedState) {
      return { state: migratedState }
    }

    if (envelope.version === 4 && migratedState) {
      return { state: migratedState }
    }

    if (envelope.version === 5 && migratedState) {
      return { state: migratedState }
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
