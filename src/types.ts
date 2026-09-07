export type Currency =
  | 'RUB'
  | 'USD'
  | 'EUR'
  | 'BYN'
  | 'KZT'
  | 'UAH'
  | 'BRL'
  | 'TRY'
  | 'PLN'
  | 'UZS'

export type EntryStatus = 'active' | 'consumed'

export interface Settings {
  roundTargetTenths: number
  eurRateTenths: number
  usdRateTenths: number
  bynRateTenths: number
  kztRateTenths: number
  uahRateTenths: number
  brlRateTenths: number
  tryRateTenths: number
  plnRateTenths: number
  uzsRateTenths: number
}

export type CurrencyRateSettings = Omit<Settings, 'roundTargetTenths'>

export interface SourceReference {
  amountTenths: number
  currency: Currency
  rateTenths?: number
  rateUnits?: number
}

export interface ImportReference {
  provider: 'donationalerts'
  externalId: string
  donatedAt: string | null
}

export interface ContributionEntry {
  id: string
  nickname: string
  isChat?: boolean
  amountTenths: number
  currency: Currency
  status: EntryStatus
  roundNumber?: number
  frozenRubTenths?: number
  appliedRateTenths?: number
  appliedRateUnits?: number
  sourceReference?: SourceReference
  importReference?: ImportReference
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
  bynRateTenths: 282,
  kztRateTenths: 190,
  uahRateTenths: 194,
  brlRateTenths: 170,
  tryRateTenths: 179,
  plnRateTenths: 232,
  uzsRateTenths: 731,
}

export const DEFAULT_STATE: AppState = {
  settings: DEFAULT_SETTINGS,
  entries: [],
  history: [],
}
