import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EntryList, UsedEntries } from '../src/components/EntryList'
import { SettingsPanel } from '../src/components/SettingsPanel'
import { DEFAULT_SETTINGS, type ContributionEntry } from '../src/types'

describe('collapsible sections', () => {
  it('keeps settings on one collapsed summary line by default', async () => {
    const user = userEvent.setup()
    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    const toggle = screen.getByRole('button', { name: /Параметры расчёта/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Новая сумма раунда')).not.toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Новая сумма раунда')).toBeInTheDocument()
  })

  it('shows active entries first and keeps consumed entries collapsed', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'used',
        nickname: 'UsedNick',
        amountTenths: 10_000,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 1,
        frozenRubTenths: 10_000,
      },
      {
        id: 'active',
        nickname: 'ActiveNick',
        amountTenths: 20_000,
        currency: 'RUB',
        status: 'active',
      },
    ]

    render(
      <>
        <EntryList
          entries={entries}
          settings={DEFAULT_SETTINGS}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <UsedEntries entries={entries} settings={DEFAULT_SETTINGS} />
      </>,
    )

    const activeTitle = screen.getByText('Активные записи')
    const usedToggle = screen.getByRole('button', {
      name: /ИСТОРИЯ/,
    })
    expect(
      activeTitle.compareDocumentPosition(usedToggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(usedToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('UsedNick')).not.toBeInTheDocument()

    await user.click(usedToggle)

    expect(screen.getByText('UsedNick')).toBeInTheDocument()
  })

  it('renders active entries and their numbers in reverse order', () => {
    const entries: ContributionEntry[] = [
      {
        id: 'older',
        nickname: 'Older',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'newer',
        nickname: 'Newer',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
      },
    ]

    render(
      <EntryList
        entries={entries}
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const newer = screen.getByText('Newer').closest('.entry-row')
    const older = screen.getByText('Older').closest('.entry-row')
    if (!newer || !older) throw new Error('Expected both active rows')
    expect(
      newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(newer.querySelector('.row-index')).toHaveTextContent('2')
    expect(older.querySelector('.row-index')).toHaveTextContent('1')
  })

  it('highlights and updates an active donation attributed to Chat', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    const entry: ContributionEntry = {
      id: 'chat-entry',
      nickname: 'Viewer',
      amountTenths: 500,
      currency: 'RUB',
      status: 'active',
      isChat: true,
    }

    render(
      <EntryList
        entries={[entry]}
        settings={DEFAULT_SETTINGS}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const row = screen.getByText('Viewer').closest('.entry-row')
    expect(row).toHaveClass('chat-attributed')

    await user.click(screen.getByLabelText('Считать донат Viewer как донат от Chat'))
    expect(onUpdate).toHaveBeenCalledWith({ ...entry, isChat: false })
  })

  it('marks a consumed donation that was attributed to Chat', async () => {
    const user = userEvent.setup()
    const entry: ContributionEntry = {
      id: 'used-chat-entry',
      nickname: 'Viewer',
      amountTenths: 500,
      currency: 'RUB',
      status: 'consumed',
      roundNumber: 1,
      frozenRubTenths: 500,
      isChat: true,
    }

    render(<UsedEntries entries={[entry]} settings={DEFAULT_SETTINGS} />)
    await user.click(screen.getByRole('button', { name: /ИСТОРИЯ/ }))

    const row = screen.getByText('Viewer').closest('.entry-row')
    expect(row).toHaveClass('chat-consumed')
    expect(row).toHaveTextContent('Chat')
  })
})
