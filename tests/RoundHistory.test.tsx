import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('does not style a regular winner literally named Chat as a Chat winner', () => {
    render(
      <RoundHistory
        onClear={vi.fn()}
        history={[
          {
            id: 'regular-chat-name',
            roundNumber: 1,
            winner: 'Chat',
            winningRubTenths: 10_000,
            targetRubTenths: 50_000,
            isChatWinner: false,
          },
        ]}
      />,
    )

    expect(screen.getByText('Chat')).not.toHaveClass('chat-winner')
  })

  it('styles the shared Chat winner from its explicit result flag', () => {
    render(
      <RoundHistory
        onClear={vi.fn()}
        history={[
          {
            id: 'shared-chat',
            roundNumber: 1,
            winner: 'Chat',
            winningRubTenths: 1_000,
            targetRubTenths: 50_000,
            isChatWinner: true,
          },
        ]}
      />,
    )

    expect(screen.getByText('Chat')).toHaveClass('chat-winner')
  })

  it('opens a wide dialog where long winner nicknames remain fully available', async () => {
    const user = userEvent.setup()
    const longNickname = 'Chel_ОченьДлинныйНикнеймБезСокращения_123456789'
    render(
      <RoundHistory
        onClear={vi.fn()}
        history={[
          {
            id: 'long-name',
            roundNumber: 12,
            winner: longNickname,
            winningRubTenths: 42_000,
            targetRubTenths: 50_000,
          },
        ]}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Открыть историю победителей полностью' }),
    )

    const dialog = screen.getByRole('dialog', { name: 'История победителей' })
    expect(within(dialog).getByText(longNickname)).toBeInTheDocument()
    expect(dialog.querySelector('.round-number')).toHaveTextContent('Гамбашар 12')
    expect(within(dialog).getByText('4200.0 RUB')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
