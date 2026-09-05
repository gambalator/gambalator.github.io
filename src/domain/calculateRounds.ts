import type {
  ContributionEntry,
  RoundResult,
  Settings,
  SourceReference,
} from '../types'
import {
  convertToRubTenths,
  normalizeNickname,
  rateFor,
} from './money'

interface RoundContribution {
  displayName: string
  rubTenths: number
}

interface Segment {
  roundNumber: number
  rubTenths: number
}

export interface CalculationOutcome {
  entries: ContributionEntry[]
  newResults: RoundResult[]
  completedRounds: number
  remainingNeededTenths: number
}

function sourceFor(
  entry: ContributionEntry,
  settings: Settings,
): SourceReference | undefined {
  if (entry.sourceReference) return entry.sourceReference
  if (entry.currency === 'RUB') return undefined

  return {
    amountTenths: entry.amountTenths,
    currency: entry.currency,
    rateTenths: rateFor(entry.currency, settings),
  }
}

function selectWinner(
  totals: Map<string, RoundContribution>,
): Pick<RoundResult, 'winner' | 'winningRubTenths'> {
  let winningRubTenths = -1

  for (const contribution of totals.values()) {
    if (contribution.rubTenths > winningRubTenths) {
      winningRubTenths = contribution.rubTenths
    }
  }

  const winners = [...totals.values()]
    .filter((contribution) => contribution.rubTenths === winningRubTenths)
    .map((contribution) => contribution.displayName)

  return {
    winner: winners.join(', '),
    winningRubTenths,
  }
}

export function calculateRounds(
  entries: ContributionEntry[],
  settings: Settings,
  firstRoundNumber: number,
  createId: () => string,
): CalculationOutcome {
  if (settings.roundTargetTenths <= 0) {
    throw new RangeError('Round target must be positive')
  }

  const consumed = entries.filter((entry) => entry.status === 'consumed')
  const active = entries.filter((entry) => entry.status === 'active')
  const converted = active.map((entry) => ({
    entry,
    rubTenths: convertToRubTenths(
      entry.amountTenths,
      entry.currency,
      settings,
    ),
  }))
  const totalRubTenths = converted.reduce(
    (total, item) => total + item.rubTenths,
    0,
  )

  if (!Number.isSafeInteger(totalRubTenths)) {
    throw new RangeError('Contribution total is too large to calculate safely')
  }

  const completedRounds = Math.floor(
    totalRubTenths / settings.roundTargetTenths,
  )
  if (completedRounds === 0) {
    return {
      entries,
      newResults: [],
      completedRounds: 0,
      remainingNeededTenths: settings.roundTargetTenths - totalRubTenths,
    }
  }

  let amountLeftToConsume = completedRounds * settings.roundTargetTenths
  let roundRemaining = settings.roundTargetTenths
  let roundNumber = firstRoundNumber
  let roundTotals = new Map<string, RoundContribution>()
  const newConsumed: ContributionEntry[] = []
  const remainingActive: ContributionEntry[] = []
  const newResults: RoundResult[] = []

  const finishRound = () => {
    const result = selectWinner(roundTotals)
    newResults.push({
      id: createId(),
      roundNumber,
      targetRubTenths: settings.roundTargetTenths,
      ...result,
    })
    roundNumber += 1
    roundRemaining = settings.roundTargetTenths
    roundTotals = new Map<string, RoundContribution>()
  }

  for (const { entry, rubTenths } of converted) {
    if (amountLeftToConsume === 0) {
      remainingActive.push(entry)
      continue
    }

    let entryRemaining = rubTenths
    const segments: Segment[] = []

    while (entryRemaining > 0 && amountLeftToConsume > 0) {
      const allocated = Math.min(entryRemaining, roundRemaining)
      const attributedNickname = entry.isChat ? 'Chat' : entry.nickname
      const key = normalizeNickname(attributedNickname)
      const prior = roundTotals.get(key)

      roundTotals.set(key, {
        displayName: prior?.displayName ?? attributedNickname.trim(),
        rubTenths: (prior?.rubTenths ?? 0) + allocated,
      })
      segments.push({ roundNumber, rubTenths: allocated })

      entryRemaining -= allocated
      amountLeftToConsume -= allocated
      roundRemaining -= allocated

      if (roundRemaining === 0) finishRound()
    }

    const fullyConsumedWithoutSplit =
      segments.length === 1 && entryRemaining === 0 && segments[0]?.rubTenths === rubTenths

    if (fullyConsumedWithoutSplit) {
      newConsumed.push({
        ...entry,
        status: 'consumed',
        roundNumber: segments[0]?.roundNumber,
        frozenRubTenths: rubTenths,
        appliedRateTenths:
          entry.currency === 'RUB'
            ? entry.appliedRateTenths
            : rateFor(entry.currency, settings),
      })
    } else {
      const sourceReference = sourceFor(entry, settings)
      for (const segment of segments) {
        newConsumed.push({
          id: createId(),
          nickname: entry.nickname,
          isChat: entry.isChat,
          amountTenths: segment.rubTenths,
          currency: 'RUB',
          status: 'consumed',
          roundNumber: segment.roundNumber,
          frozenRubTenths: segment.rubTenths,
          sourceReference,
        })
      }

      if (entryRemaining > 0) {
        remainingActive.push({
          id: createId(),
          nickname: entry.nickname,
          isChat: entry.isChat,
          amountTenths: entryRemaining,
          currency: 'RUB',
          status: 'active',
          frozenRubTenths: entryRemaining,
          sourceReference,
        })
      }
    }
  }

  const unfinishedRubTenths = totalRubTenths % settings.roundTargetTenths

  return {
    entries: [...consumed, ...newConsumed, ...remainingActive],
    newResults,
    completedRounds,
    remainingNeededTenths:
      unfinishedRubTenths === 0
        ? settings.roundTargetTenths
        : settings.roundTargetTenths - unfinishedRubTenths,
  }
}
