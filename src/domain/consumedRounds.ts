import type { ContributionEntry, Settings } from '../types'
import { convertToRubTenths, normalizeNickname } from './money'

export interface ConsumedRoundItem {
  entry: ContributionEntry
  position: number
}

export interface ConsumedRoundGroup {
  roundNumber: number
  items: ConsumedRoundItem[]
  chatWins: boolean
  individualKeys: Set<string>
  winner: string
  winningRubTenths: number
}

function rubEquivalent(entry: ContributionEntry, settings: Settings): number {
  return (
    entry.frozenRubTenths ??
    convertToRubTenths(entry.amountTenths, entry.currency, settings)
  )
}

function winnerSelectionFor(
  items: ConsumedRoundItem[],
  settings: Settings,
): Omit<ConsumedRoundGroup, 'roundNumber' | 'items'> {
  const closingEntry = items[items.length - 1]?.entry
  if (closingEntry?.isChat === true) {
    return {
      chatWins: true,
      individualKeys: new Set(),
      winner: 'Chat',
      winningRubTenths: items.reduce(
        (total, { entry }) => total + (entry.isChat ? rubEquivalent(entry, settings) : 0),
        0,
      ),
    }
  }

  const totals = new Map<string, { displayName: string; rubTenths: number }>()
  for (const { entry } of items) {
    if (entry.isChat) continue
    const key = normalizeNickname(entry.nickname)
    const prior = totals.get(key)
    totals.set(key, {
      displayName: prior?.displayName ?? entry.nickname.trim(),
      rubTenths: (prior?.rubTenths ?? 0) + rubEquivalent(entry, settings),
    })
  }

  const largest = Math.max(0, ...[...totals.values()].map((total) => total.rubTenths))
  const winners = [...totals.entries()]
    .filter(([, total]) => total.rubTenths === largest)

  return {
    chatWins: false,
    individualKeys: new Set(winners.map(([key]) => key)),
    winner: winners.map(([, total]) => total.displayName).join(', '),
    winningRubTenths: largest,
  }
}

export function consumedRoundGroupsFor(
  entries: ContributionEntry[],
  settings: Settings,
): ConsumedRoundGroup[] {
  const consumed = entries.filter((entry) => entry.status === 'consumed')
  const groupsByRound = new Map<number, ConsumedRoundItem[]>()

  consumed.forEach((entry, index) => {
    const roundNumber = entry.roundNumber ?? 0
    const item = { entry, position: index + 1 }
    groupsByRound.set(roundNumber, [...(groupsByRound.get(roundNumber) ?? []), item])
  })

  return [...groupsByRound.entries()]
    .map(([roundNumber, items]) => ({
      roundNumber,
      items,
      ...winnerSelectionFor(items, settings),
    }))
    .sort((first, second) => second.roundNumber - first.roundNumber)
}
