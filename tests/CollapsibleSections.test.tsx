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

  it('keeps additional DonationAlerts currencies hidden until requested', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onUpdate={onUpdate}
        onDirtyChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Параметры расчёта/ }))
    expect(screen.getByLabelText('Курс EUR')).toBeInTheDocument()
    expect(screen.queryByLabelText('Курс KZT')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ОТКРЫТЬ ВСЕ ВАЛЮТЫ' }))
    const kztRate = screen.getByLabelText('Курс KZT')
    expect(kztRate).toHaveValue('19.0')
    await user.clear(kztRate)
    await user.type(kztRate, '20.0')
    await user.click(screen.getByRole('button', { name: 'Сохранить курсы' }))

    expect(onUpdate).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      kztRateTenths: 200,
    })
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

  it('shows an imported donation timestamp in Moscow time', () => {
    const entry: ContributionEntry = {
      id: 'donationalerts:1',
      nickname: 'Chel_1',
      amountTenths: 100,
      currency: 'RUB',
      status: 'active',
      importReference: {
        provider: 'donationalerts',
        externalId: '1',
        donatedAt: '2026-09-06 10:20:00',
      },
    }

    render(
      <EntryList
        entries={[entry]}
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    expect(screen.getByText(/13:20.*МСК/)).toBeInTheDocument()
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
    expect(screen.getByText('Viewer').closest('.name-cell')).toHaveClass(
      'round-winner',
    )
  })

  it('shows newest consumed groups first and highlights each winner', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'round-1-winner',
        nickname: 'Alice',
        amountTenths: 300,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 1,
        frozenRubTenths: 300,
      },
      {
        id: 'round-1-other',
        nickname: 'Bob',
        amountTenths: 200,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 1,
        frozenRubTenths: 200,
      },
      {
        id: 'round-2-other',
        nickname: 'Carol',
        amountTenths: 100,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 2,
        frozenRubTenths: 100,
      },
      {
        id: 'round-2-winner',
        nickname: 'Dana',
        amountTenths: 400,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 2,
        frozenRubTenths: 400,
      },
    ]

    render(<UsedEntries entries={entries} settings={DEFAULT_SETTINGS} />)
    const historyToggle = screen.getByRole('button', { name: /ИСТОРИЯ/ })
    expect(historyToggle).toHaveTextContent('2')
    await user.click(historyToggle)

    const newerGroup = screen.getByText('Гамбашар 2').closest('.used-round-group')
    const olderGroup = screen.getByText('Гамбашар 1').closest('.used-round-group')
    if (!newerGroup || !olderGroup) throw new Error('Expected both round groups')
    expect(
      newerGroup.compareDocumentPosition(olderGroup) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('Dana').closest('.name-cell')).toHaveClass(
      'round-winner',
    )
    expect(screen.getByText('Alice').closest('.name-cell')).toHaveClass(
      'round-winner',
    )
    expect(screen.getByText('Bob').closest('.name-cell')).not.toHaveClass(
      'round-winner',
    )
  })
})
