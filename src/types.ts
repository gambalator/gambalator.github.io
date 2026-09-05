export type Currency = 'RUB' | 'USD' | 'EUR'

export type EntryStatus = 'active' | 'consumed'

export interface Settings {
  roundTargetTenths: number
  eurRateTenths: number
  usdRateTenths: number
}

export interface SourceReference {
  amountTenths: number
  currency: Currency
  rateTenths: number
}

export interface ContributionEntry {
  id: string
  nickname: string
  amountTenths: number
  currency: Currency
  status: EntryStatus
  roundNumber?: number
  frozenRubTenths?: number
  appliedRateTenths?: number
  sourceReference?: SourceReference
}

export interface RoundResult {
  id: string
  roundNumber: number
  winner: string
  winningRubTenths: number
  targetRubTenths: number
  isLatest?: boolean
}

export interface AppState {
  settings: Settings
  entries: ContributionEntry[]
  history: RoundResult[]
}

export const DEFAULT_SETTINGS: Settings = {
  roundTargetTenths: 50_000,
  eurRateTenths: 1_000,
  usdRateTenths: 855,
}

export const DEFAULT_STATE: AppState = {
  settings: DEFAULT_SETTINGS,
  entries: [],
  history: [],
}
