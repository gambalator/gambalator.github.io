import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoundHistory } from '../src/components/RoundHistory'

describe('RoundHistory', () => {
  it('visually distinguishes earlier winners from the latest batch', () => {
    render(
      <RoundHistory
        onClear={vi.fn()}
        history={[
          {
            id: 'old',
            roundNumber: 1,
            winner: 'OldWinner',
            winningRubTenths: 30_000,
            targetRubTenths: 50_000,
            isLatest: false,
          },
          {
            id: 'new',
            roundNumber: 2,
            winner: 'NewWinner',
            winningRubTenths: 40_000,
            targetRubTenths: 50_000,
            isLatest: true,
          },
        ]}
      />,
    )

    expect(screen.getByText('OldWinner').closest('li')).toHaveClass(
      'previous-winner',
    )
    expect(screen.getByText('NewWinner').closest('li')).toHaveClass(
      'latest-winner',
    )
  })
})
