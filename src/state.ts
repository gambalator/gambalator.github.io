import type {
  AppState,
  ContributionEntry,
  RoundResult,
  Settings,
} from './types'

export type AppAction =
  | { type: 'settings/update'; settings: Settings }
  | { type: 'entry/add'; entry: ContributionEntry }
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

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'settings/update':
      return { ...state, settings: action.settings }
    case 'entry/add':
      return withActiveEntries(state, [...activeEntries(state), action.entry])
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
        history: [...state.history, ...action.results],
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
