import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoundHistory } from '../src/components/RoundHistory'

describe('RoundHistory', () => {
  it('shows newest winners first without line-number badges', () => {
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

    const oldWinner = screen.getByText('OldWinner').closest('li')
    const newWinner = screen.getByText('NewWinner').closest('li')
    expect(oldWinner).toHaveClass('previous-winner')
    expect(newWinner).toHaveClass('latest-winner')
    if (!oldWinner || !newWinner) throw new Error('Expected both winner rows')
    expect(
      newWinner.compareDocumentPosition(oldWinner) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(document.querySelector('.history-index')).not.toBeInTheDocument()
  })

  it('shows every nickname from a tied result', () => {
    render(
      <RoundHistory
        onClear={vi.fn()}
        history={[
          {
            id: 'tie',
            roundNumber: 1,
            winner: 'Alice, Bob',
            winningRubTenths: 25_000,
            targetRubTenths: 50_000,
          },
        ]}
      />,
    )

    expect(screen.getByText('Alice, Bob')).toBeInTheDocument()
  })
})
