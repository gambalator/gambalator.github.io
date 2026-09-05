import type { ContributionEntry, RoundResult } from '../types'

export function nextRoundNumber(
  entries: ContributionEntry[],
  history: RoundResult[],
): number {
  let highestRoundNumber = 0

  for (const entry of entries) {
    if (
      entry.status === 'consumed' &&
      entry.roundNumber !== undefined &&
      entry.roundNumber > highestRoundNumber
    ) {
      highestRoundNumber = entry.roundNumber
    }
  }

  for (const result of history) {
    if (result.roundNumber > highestRoundNumber) {
      highestRoundNumber = result.roundNumber
    }
  }

  return highestRoundNumber + 1
}
