import { describe, expect, it } from 'vitest'
import { nextRoundNumber } from '../src/domain/nextRoundNumber'
import type { ContributionEntry, RoundResult } from '../src/types'

const consumed = (roundNumber: number): ContributionEntry => ({
  id: `entry-${roundNumber}`,
  nickname: 'Viewer',
  amountTenths: 100,
  currency: 'RUB',
  status: 'consumed',
  roundNumber,
})

const result = (roundNumber: number): RoundResult => ({
  id: `result-${roundNumber}`,
  roundNumber,
  winner: 'Viewer',
  winningRubTenths: 100,
  targetRubTenths: 100,
})

describe('nextRoundNumber', () => {
  it('continues after consumed history when winner history was cleared', () => {
    expect(nextRoundNumber([consumed(1), consumed(2)], [])).toBe(3)
  })

  it('continues after winner history when consumed history was cleared', () => {
    expect(nextRoundNumber([], [result(4)])).toBe(5)
  })

  it('uses the highest round from either history', () => {
    expect(nextRoundNumber([consumed(3)], [result(5)])).toBe(6)
  })

  it('starts from one when both histories are empty', () => {
    expect(nextRoundNumber([], [])).toBe(1)
  })
})
