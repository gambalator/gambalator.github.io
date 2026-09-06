import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EntryForm } from '../src/components/EntryForm'

describe('EntryForm', () => {
  it('starts as one collapsed line and focuses nickname when opened', async () => {
    const user = userEvent.setup()
    render(<EntryForm onAdd={vi.fn()} createId={() => 'entry-1'} />)

    const toggle = screen.getByRole('button', { name: /Добавить донат вручную/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).not.toHaveTextContent('Никнейм')
    expect(toggle).not.toHaveTextContent('Сумма')
    expect(screen.queryByLabelText('Никнейм')).not.toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Никнейм')).toHaveFocus()
  })

  it('adds a trimmed entry and restores form defaults', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<EntryForm onAdd={onAdd} createId={() => 'entry-1'} />)

    await user.click(screen.getByRole('button', { name: /Добавить донат вручную/ }))
    await user.type(screen.getByLabelText('Никнейм'), '  PivoLover  ')
    await user.type(screen.getByLabelText('Сумма'), '12.5')
    await user.selectOptions(screen.getByLabelText('Валюта'), 'USD')
    await user.click(screen.getByRole('button', { name: /ДОБАВИТЬ/ }))

    expect(onAdd).toHaveBeenCalledWith({
      id: 'entry-1',
      nickname: 'PivoLover',
      isChat: false,
      amountTenths: 125,
      currency: 'USD',
      status: 'active',
    })
    expect(screen.getByLabelText('Никнейм')).toHaveValue('')
    expect(screen.getByLabelText('Сумма')).toHaveValue('')
    expect(screen.getByLabelText('Валюта')).toHaveValue('RUB')
    expect(screen.getByLabelText('Считать новый донат как донат от Chat')).not.toBeChecked()
  })

  it('adds a donation attributed to Chat and resets the toggle', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<EntryForm onAdd={onAdd} createId={() => 'entry-chat'} />)

    await user.click(screen.getByRole('button', { name: /Добавить донат вручную/ }))
    await user.type(screen.getByLabelText('Никнейм'), 'Viewer')
    await user.type(screen.getByLabelText('Сумма'), '5000.0')
    const chatToggle = screen.getByLabelText('Считать новый донат как донат от Chat')
    await user.click(chatToggle)
    await user.click(screen.getByRole('button', { name: /ДОБАВИТЬ/ }))

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      nickname: 'Viewer',
      isChat: true,
    }))
    expect(chatToggle).not.toBeChecked()
  })

  it('shows a Russian validation error for an invalid amount', async () => {
    const user = userEvent.setup()
    render(<EntryForm onAdd={vi.fn()} createId={() => 'entry-1'} />)

    await user.click(screen.getByRole('button', { name: /Добавить донат вручную/ }))
    await user.type(screen.getByLabelText('Никнейм'), 'Alex')
    await user.type(screen.getByLabelText('Сумма'), '1.25')
    await user.click(screen.getByRole('button', { name: /ДОБАВИТЬ/ }))

    expect(screen.getByText(/Сумма должна быть больше 0/)).toBeInTheDocument()
  })
})
