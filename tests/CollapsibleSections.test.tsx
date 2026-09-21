import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntryList, UsedEntries } from '../src/components/EntryList'
import { SettingsPanel } from '../src/components/SettingsPanel'
import { calculateRounds } from '../src/domain/calculateRounds'
import { activeIdsAfterDisplayMove } from '../src/domain/displayGroups'
import { DEFAULT_SETTINGS, type ContributionEntry } from '../src/types'

describe('collapsible sections', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('gambalator:entry-list-grouping:v1', JSON.stringify({
      version: 1,
      autoMerge: false,
      groups: [],
      exclusions: [],
    }))
  })

  it('keeps every group member contiguous when moving display blocks', () => {
    const newestFirstBlocks = [
      { id: 'd', entryIds: ['d'] },
      { id: 'group', entryIds: ['b', 'c'] },
      { id: 'a', entryIds: ['a'] },
    ]

    expect(activeIdsAfterDisplayMove(
      newestFirstBlocks,
      'group',
      'd',
      true,
    )).toEqual(['a', 'd', 'b', 'c'])
    expect(activeIdsAfterDisplayMove(
      newestFirstBlocks,
      'group',
      'a',
      true,
    )).toEqual(['b', 'c', 'a', 'd'])
    expect(activeIdsAfterDisplayMove(
      [...newestFirstBlocks].reverse(),
      'group',
      'd',
      false,
    )).toEqual(['a', 'd', 'b', 'c'])
  })

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

  it('loads Bank of Russia rates into drafts before saving them', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            source: 'Банк России',
            sourceUrl: 'https://www.cbr.ru/scripts/XML_daily.asp',
            effectiveDate: '2026-09-08',
            rates: [
              { currency: 'EUR', units: 1, rubTenths: 923 },
              { currency: 'USD', units: 1, rubTenths: 785 },
              { currency: 'BYN', units: 1, rubTenths: 271 },
              { currency: 'KZT', units: 100, rubTenths: 157 },
              { currency: 'UAH', units: 10, rubTenths: 175 },
              { currency: 'BRL', units: 1, rubTenths: 155 },
              { currency: 'TRY', units: 10, rubTenths: 180 },
              { currency: 'PLN', units: 1, rubTenths: 232 },
              { currency: 'UZS', units: 10_000, rubTenths: 731 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onUpdate={onUpdate}
        onDirtyChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Параметры расчёта/ }))
    await user.click(screen.getByRole('button', { name: 'Получить курсы ЦБ РФ' }))

    expect(await screen.findByText(/за 08\.09\.2026 загружены/)).toBeInTheDocument()
    expect(screen.getByLabelText('Курс EUR')).toHaveValue('92.3')
    expect(screen.getByLabelText('Курс USD')).toHaveValue('78.5')
    expect(onUpdate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Сохранить курсы' }))
    expect(onUpdate).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      eurRateTenths: 923,
      usdRateTenths: 785,
      bynRateTenths: 271,
      kztRateTenths: 157,
      uahRateTenths: 175,
      brlRateTenths: 155,
      tryRateTenths: 180,
      plnRateTenths: 232,
      uzsRateTenths: 731,
    })
    vi.unstubAllGlobals()
  })

  it('shows background rate updates while preserving an operator draft', async () => {
    const user = userEvent.setup()
    const props = {
      onUpdate: vi.fn(),
      onDirtyChange: vi.fn(),
    }
    const { rerender } = render(
      <SettingsPanel settings={DEFAULT_SETTINGS} {...props} />,
    )

    await user.click(screen.getByRole('button', { name: /Параметры расчёта/ }))
    const eurRate = screen.getByLabelText('Курс EUR')
    await user.clear(eurRate)
    await user.type(eurRate, '99.9')

    rerender(
      <SettingsPanel
        settings={{ ...DEFAULT_SETTINGS, eurRateTenths: 923, usdRateTenths: 785 }}
        {...props}
      />,
    )

    expect(screen.getByLabelText('Курс EUR')).toHaveValue('99.9')
    expect(screen.getByLabelText('Курс USD')).toHaveValue('78.5')
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

    const activeTitle = document.querySelector('.active-total')
    if (!activeTitle) throw new Error('Expected active donation summary')
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

  it('switches the visual active-entry order without requesting a queue reorder', async () => {
    const user = userEvent.setup()
    const onReorder = vi.fn()
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
        onReorder={onReorder}
      />,
    )

    const older = screen.getByText('Older').closest('.entry-row')
    const newer = screen.getByText('Newer').closest('.entry-row')
    if (!older || !newer) throw new Error('Expected both active rows')
    expect(
      older.compareDocumentPosition(newer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(older.querySelector('.row-index')).toHaveTextContent('1')
    expect(newer.querySelector('.row-index')).toHaveTextContent('2')
    expect(document.querySelector('.active-total')).toHaveTextContent(
      '30.0 RUB0 гамбашаров',
    )

    await user.click(screen.getByRole('button', { name: /Показать сначала новые/ }))

    const newerFirst = screen.getByText('Newer').closest('.entry-row')
    const olderSecond = screen.getByText('Older').closest('.entry-row')
    if (!newerFirst || !olderSecond) throw new Error('Expected both reordered rows')
    expect(
      newerFirst.compareDocumentPosition(olderSecond) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(newerFirst.querySelector('.row-index')).toHaveTextContent('2')
    expect(olderSecond.querySelector('.row-index')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /Показать сначала старые/ })).toBeInTheDocument()
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('marks only the canonical entries needed to complete the next round', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'first',
        nickname: 'First',
        amountTenths: 30_000,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'boundary',
        nickname: 'Boundary',
        amountTenths: 25_000,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'later',
        nickname: 'Later',
        amountTenths: 10_000,
        currency: 'RUB',
        status: 'active',
      },
    ]
    const props = {
      entries,
      onUpdate: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
    }
    const { rerender } = render(
      <EntryList settings={DEFAULT_SETTINGS} {...props} />,
    )

    expect(screen.getByText('First').closest('.entry-row'))
      .toHaveClass('next-round-entry')
    expect(screen.getByText('Boundary').closest('.entry-row'))
      .toHaveClass('next-round-entry')
    expect(screen.getByText('Later').closest('.entry-row'))
      .not.toHaveClass('next-round-entry')
    const nextRoundGroup = document.querySelector('.next-round-group')
    expect(nextRoundGroup).toContainElement(screen.getByText('First'))
    expect(nextRoundGroup).toContainElement(screen.getByText('Boundary'))
    expect(nextRoundGroup).not.toContainElement(screen.getByText('Later'))

    await user.click(screen.getByRole('button', { name: /Показать сначала новые/ }))

    expect(screen.getByText('First').closest('.entry-row'))
      .toHaveClass('next-round-entry')
    expect(screen.getByText('Boundary').closest('.entry-row'))
      .toHaveClass('next-round-entry')
    expect(screen.getByText('Later').closest('.entry-row'))
      .not.toHaveClass('next-round-entry')

    rerender(
      <EntryList
        settings={{ ...DEFAULT_SETTINGS, roundTargetTenths: 70_000 }}
        {...props}
      />,
    )

    expect(document.querySelector('.next-round-entry')).not.toBeInTheDocument()
    expect(document.querySelector('.next-round-group')).not.toBeInTheDocument()
  })

  it('marks a group and only its contributing expanded donations', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'group-first',
        nickname: 'First',
        amountTenths: 30_000,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'group-boundary',
        nickname: 'Boundary',
        amountTenths: 25_000,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'group-later',
        nickname: 'Later',
        amountTenths: 10_000,
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

    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    for (const entry of entries) {
      await user.click(screen.getByLabelText(
        `Выбрать донат ${entry.nickname} для объединения`,
      ))
    }
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))

    expect(document.querySelector('.merged-row')).toHaveClass('next-round-entry')
    await user.click(screen.getByRole('button', { name: 'Раскрыть группу First' }))

    expect(document.querySelector('.merged-row')).not.toHaveClass('next-round-entry')
    const groupedRows = [...document.querySelectorAll('.grouped-donation-row')]
    expect(groupedRows).toHaveLength(3)
    expect(groupedRows[0]).toHaveClass('next-round-entry')
    expect(groupedRows[1]).toHaveClass('next-round-entry')
    expect(groupedRows[2]).not.toHaveClass('next-round-entry')
  })

  it('manually groups adjacent compatible donations without changing entry data', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    const onRemove = vi.fn()
    const onReorder = vi.fn()
    const entries: ContributionEntry[] = [
      {
        id: 'alice-1',
        nickname: 'Alice',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'alice-2',
        nickname: 'Alice',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
      },
    ]

    render(
      <EntryList
        entries={entries}
        settings={DEFAULT_SETTINGS}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onReorder={onReorder}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    const checkboxes = screen.getAllByLabelText(
      'Выбрать донат Alice для объединения',
    )
    await user.click(checkboxes[0]!)
    await user.click(checkboxes[1]!)
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))

    const group = document.querySelector('.merged-row')
    expect(group).toHaveTextContent('Alice')
    expect(group).toHaveTextContent('2 доната')
    expect(group).toHaveTextContent('30.0 RUB')
    expect(group).toHaveTextContent('Объединённая группа')
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onRemove).not.toHaveBeenCalled()
    expect(onReorder).not.toHaveBeenCalled()

    const expandGroup = screen.getByRole('button', { name: 'Раскрыть группу Alice' })
    expect(expandGroup).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Донаты группы Alice')).not.toBeInTheDocument()

    await user.click(expandGroup)

    expect(screen.getByRole('button', { name: 'Свернуть группу Alice' }))
      .toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Донаты группы Alice'))
      .toBeInTheDocument()
    expect(document.querySelectorAll('.grouped-donation-row')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Разъединить группу Alice' }))

    expect(document.querySelector('.merged-row')).not.toBeInTheDocument()
    expect(screen.getAllByText('Alice')).toHaveLength(2)
  })

  it('restores a named manual group after reload without wiping it during hydration', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'persist-alice',
        nickname: 'Alice',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'persist-bob',
        nickname: 'Bob',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
      },
    ]
    const props = {
      settings: DEFAULT_SETTINGS,
      onUpdate: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
    }
    let view = render(<EntryList entries={entries} {...props} />)

    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    await user.click(screen.getByLabelText('Выбрать донат Alice для объединения'))
    await user.click(screen.getByLabelText('Выбрать донат Bob для объединения'))
    const name = screen.getByLabelText('Название группы')
    await user.clear(name)
    await user.type(name, 'Постоянная группа')
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))
    expect(screen.getByRole('button', { name: 'Раскрыть группу Постоянная группа' }))
      .toBeInTheDocument()
    view.unmount()

    view = render(
      <EntryList entries={[]} persistenceReady={false} {...props} />,
    )
    view.rerender(
      <EntryList entries={entries} persistenceReady {...props} />,
    )

    expect(screen.getByRole('button', { name: 'Раскрыть группу Постоянная группа' }))
      .toBeInTheDocument()
    expect(document.querySelector('.merged-row')).toHaveTextContent('30.0 RUB')
  })

  it('restores Auto and keeps an explicitly unmerged run separate after reload', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'persist-auto-1',
        nickname: 'Alice',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'persist-auto-2',
        nickname: 'alice',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
      },
    ]
    const props = {
      entries,
      settings: DEFAULT_SETTINGS,
      onUpdate: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
    }
    let view = render(<EntryList {...props} />)

    await user.click(screen.getByRole('button', { name: 'Авто: выкл' }))
    expect(document.querySelector('.merged-row')).toBeInTheDocument()
    view.unmount()

    view = render(<EntryList {...props} />)
    expect(screen.getByRole('button', { name: 'Авто: вкл' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(document.querySelector('.merged-row')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Разъединить группу Alice' }))
    expect(document.querySelector('.merged-row')).not.toBeInTheDocument()
    view.unmount()

    render(<EntryList {...props} />)
    expect(screen.getByRole('button', { name: 'Авто: вкл' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(document.querySelector('.merged-row')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Alice/i)).toHaveLength(2)
  })

  it('groups different regular names under an editable prefilled group name', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    const onReorder = vi.fn()
    const entries: ContributionEntry[] = [
      {
        id: 'alice',
        nickname: 'Alice',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'bob',
        nickname: 'Bob',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'charlie',
        nickname: 'Charlie',
        amountTenths: 300,
        currency: 'RUB',
        status: 'active',
      },
    ]

    render(
      <EntryList
        entries={entries}
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onRemove={onRemove}
        onReorder={onReorder}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    await user.click(screen.getByLabelText('Выбрать донат Alice для объединения'))
    await user.click(screen.getByLabelText('Выбрать донат Bob для объединения'))

    const groupName = screen.getByLabelText('Название группы')
    expect(groupName).toHaveValue('Alice')
    await user.clear(groupName)
    await user.type(groupName, 'Команда')
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))

    const groupRow = document.querySelector('.merged-row')
    expect(groupRow).toHaveTextContent('Команда')
    expect(groupRow?.querySelectorAll('.row-index')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Изменить порядок группы Команда' }))
      .toBeInTheDocument()
    expect(screen.queryByText('Разъединить')).not.toBeInTheDocument()

    expect(onReorder).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Изменить группу Команда' }))
    const editedName = screen.getByLabelText('Название группы')
    await user.clear(editedName)
    await user.type(editedName, 'Новая команда')
    await user.click(screen.getByRole('button', { name: 'Сохранить название группы' }))

    expect(screen.getByText('Новая команда')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Удалить группу Новая команда' }))

    expect(onRemove).toHaveBeenCalledOnce()
    expect(onRemove).toHaveBeenCalledWith(['alice', 'bob'])
  })

  it('forces Chat as the group name and rejects mixed Chat attribution', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'regular',
        nickname: 'Regular',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'chat-1',
        nickname: 'Carol',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
        isChat: true,
      },
      {
        id: 'chat-2',
        nickname: 'Dana',
        amountTenths: 300,
        currency: 'RUB',
        status: 'active',
        isChat: true,
      },
    ]

    const { rerender } = render(
      <EntryList
        entries={entries}
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    await user.click(screen.getByLabelText('Выбрать донат Carol для объединения'))
    await user.click(screen.getByLabelText('Выбрать донат Dana для объединения'))

    expect(screen.getByLabelText('Название группы')).toHaveValue('Chat')
    expect(screen.getByLabelText('Название группы')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))
    expect(screen.getByRole('button', { name: 'Раскрыть группу Chat' }))
      .toBeInTheDocument()

    rerender(
      <EntryList
        entries={entries}
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Разъединить группу Chat' }))
    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    await user.click(screen.getByLabelText('Выбрать донат Regular для объединения'))
    await user.click(screen.getByLabelText('Выбрать донат Carol для объединения'))
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))

    expect(screen.getByText('Нельзя объединять обычные и Chat-донаты в одну группу.'))
      .toBeInTheDocument()
    expect(document.querySelector('.merged-row')).not.toBeInTheDocument()
  })

  it('auto-groups only uninterrupted nickname and Chat runs and can ungroup them', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'alice-1',
        nickname: 'Alice',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'alice-2',
        nickname: ' alice ',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'gap',
        nickname: 'Bob',
        amountTenths: 300,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'alice-after-gap',
        nickname: 'Alice',
        amountTenths: 400,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'chat-1',
        nickname: 'Carol',
        amountTenths: 500,
        currency: 'RUB',
        status: 'active',
        isChat: true,
      },
      {
        id: 'chat-2',
        nickname: 'Dana',
        amountTenths: 600,
        currency: 'RUB',
        status: 'active',
        isChat: true,
      },
    ]

    const { rerender } = render(
      <EntryList
        entries={entries}
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Авто: выкл' }))

    expect(screen.getByRole('button', { name: 'Авто: вкл' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const groups = [...document.querySelectorAll('.merged-row')]
    expect(groups).toHaveLength(2)
    expect(groups.some((group) => group.textContent?.includes('Alice') &&
      group.textContent.includes('30.0 RUB'))).toBe(true)
    expect(groups.some((group) => group.textContent?.includes('Chat') &&
      group.textContent.includes('110.0 RUB'))).toBe(true)
    expect(screen.getAllByText('Alice')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Авто: вкл' }))

    expect(screen.getByRole('button', { name: 'Авто: выкл' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(document.querySelectorAll('.merged-row')).toHaveLength(2)

    const laterChatDonation: ContributionEntry = {
      id: 'chat-after-auto-off',
      nickname: 'Evan',
      amountTenths: 700,
      currency: 'RUB',
      status: 'active',
      isChat: true,
    }
    rerender(
      <EntryList
        entries={[...entries, laterChatDonation]}
        settings={DEFAULT_SETTINGS}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    expect(document.querySelectorAll('.merged-row')).toHaveLength(2)
    expect(screen.getByText('Evan')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Разъединить группу Chat' }))

    expect(screen.queryByRole('button', { name: 'Разъединить группу Chat' }))
      .not.toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
    expect(screen.getByText('Dana')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Разъединить группу Alice' }))
      .toBeInTheDocument()
  })

  it('extends an existing Auto group when a matching donation is inserted before it', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'alice-1',
        nickname: 'Alice',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'alice-2',
        nickname: 'alice',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
      },
    ]
    const props = {
      settings: DEFAULT_SETTINGS,
      onUpdate: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
    }
    const { rerender } = render(<EntryList entries={entries} {...props} />)

    await user.click(screen.getByRole('button', { name: 'Авто: выкл' }))
    await user.click(screen.getByRole('button', { name: 'Авто: вкл' }))

    rerender(
      <EntryList
        entries={[
          {
            id: 'alice-restored',
            nickname: ' ALICE ',
            amountTenths: 300,
            currency: 'RUB',
            status: 'active',
          },
          ...entries,
        ]}
        {...props}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Авто: выкл' }))

    const group = document.querySelector('.merged-row')
    expect(group).toHaveTextContent('3 доната')
    expect(group).toHaveTextContent('60.0 RUB')
  })

  it('keeps a mixed-name manual group intact while Auto processes nearby rows', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'alice',
        nickname: 'Alice',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'bob-1',
        nickname: 'Bob',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'bob-2',
        nickname: 'Bob',
        amountTenths: 300,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'bob-3',
        nickname: 'Bob',
        amountTenths: 400,
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
    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    await user.click(screen.getByLabelText('Выбрать донат Alice для объединения'))
    const bobCheckboxes = screen.getAllByLabelText('Выбрать донат Bob для объединения')
    await user.click(bobCheckboxes[0]!)
    const name = screen.getByLabelText('Название группы')
    await user.clear(name)
    await user.type(name, 'Команда')
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))
    await user.click(screen.getByRole('button', { name: 'Авто: выкл' }))

    expect(screen.getByRole('button', { name: 'Раскрыть группу Команда' }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Раскрыть группу Bob' }))
      .toBeInTheDocument()
    expect(document.querySelectorAll('.merged-row')).toHaveLength(2)
  })

  it('calculates original donations instead of a visual alias and exposes a split remainder', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'alice',
        nickname: 'Alice',
        amountTenths: 40_000,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'bob',
        nickname: 'Bob',
        amountTenths: 20_000,
        currency: 'RUB',
        status: 'active',
      },
    ]
    const props = {
      settings: DEFAULT_SETTINGS,
      onUpdate: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
    }
    const { rerender } = render(<EntryList entries={entries} {...props} />)

    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    await user.click(screen.getByLabelText('Выбрать донат Alice для объединения'))
    await user.click(screen.getByLabelText('Выбрать донат Bob для объединения'))
    const name = screen.getByLabelText('Название группы')
    await user.clear(name)
    await user.type(name, 'Команда')
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))

    let nextId = 0
    const outcome = calculateRounds(
      entries,
      DEFAULT_SETTINGS,
      1,
      () => `calculated-${++nextId}`,
    )
    expect(outcome.newResults[0]?.winner).toBe('Alice')
    rerender(<EntryList entries={outcome.entries} {...props} />)

    expect(document.querySelector('.merged-row')).not.toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(document.querySelector('.active-total')).toHaveTextContent('1000.0 RUB')
  })

  it('keeps two surviving members grouped after an earlier member is consumed', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'closer',
        nickname: 'Closer',
        amountTenths: 50_000,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'later-1',
        nickname: 'Later one',
        amountTenths: 10_000,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'later-2',
        nickname: 'Later two',
        amountTenths: 10_000,
        currency: 'RUB',
        status: 'active',
      },
    ]
    const props = {
      settings: DEFAULT_SETTINGS,
      onUpdate: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
    }
    const { rerender } = render(<EntryList entries={entries} {...props} />)

    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    for (const entry of entries) {
      await user.click(screen.getByLabelText(
        `Выбрать донат ${entry.nickname} для объединения`,
      ))
    }
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))

    let nextId = 0
    const outcome = calculateRounds(
      entries,
      DEFAULT_SETTINGS,
      1,
      () => `calculated-${++nextId}`,
      1,
    )
    rerender(<EntryList entries={outcome.entries} {...props} />)

    const group = document.querySelector('.merged-row')
    expect(group).toHaveTextContent('2 доната')
    expect(group).toHaveTextContent('2000.0 RUB')
    expect(screen.getByRole('button', { name: 'Раскрыть группу Closer' }))
      .toBeInTheDocument()
  })

  it('rejects a manual group when matching donations have a gap', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'alice-1',
        nickname: 'Alice',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'bob',
        nickname: 'Bob',
        amountTenths: 200,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'alice-2',
        nickname: 'Alice',
        amountTenths: 300,
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

    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    const aliceCheckboxes = screen.getAllByLabelText(
      'Выбрать донат Alice для объединения',
    )
    await user.click(aliceCheckboxes[0]!)
    await user.click(aliceCheckboxes[1]!)
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))

    expect(screen.getByText(/Можно объединить только соседние донаты/))
      .toBeInTheDocument()
    expect(document.querySelector('.merged-row')).not.toBeInTheDocument()
  })

  it('shows the converted RUB sum instead of the active-entry count', () => {
    const entries: ContributionEntry[] = [
      {
        id: 'rub',
        nickname: 'Rub donor',
        amountTenths: 1_000,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'eur',
        nickname: 'Euro donor',
        amountTenths: 20,
        currency: 'EUR',
        status: 'active',
      },
    ]

    render(
      <EntryList
        entries={entries}
        settings={{
          ...DEFAULT_SETTINGS,
          roundTargetTenths: 1_500,
          eurRateTenths: 1_000,
        }}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    expect(document.querySelector('.active-total')).toHaveTextContent(
      '300.0 RUB2 гамбашара',
    )
    expect(screen.queryByText('2', { selector: '.active-total' }))
      .not.toBeInTheDocument()
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

  it('shows the original donation amount on active and consumed split rows', async () => {
    const user = userEvent.setup()
    const sourceReference = {
      amountTenths: 10_000,
      currency: 'EUR' as const,
      rateTenths: 1_002,
      rateUnits: 1,
    }
    const entries: ContributionEntry[] = [
      {
        id: 'split-used',
        nickname: 'EuroDonor',
        amountTenths: 50_000,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 1,
        frozenRubTenths: 50_000,
        sourceReference,
      },
      {
        id: 'split-active',
        nickname: 'EuroDonor',
        amountTenths: 50_200,
        currency: 'RUB',
        status: 'active',
        frozenRubTenths: 50_200,
        sourceReference,
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

    expect(screen.getAllByText('Исходный донат: 1000.0 EUR')).toHaveLength(1)
    expect(screen.queryByText(
      'Исходная запись: 1000.0 EUR по курсу 1 EUR = 100.2 RUB',
    )).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ИСТОРИЯ/ }))

    expect(screen.getAllByText('Исходный донат: 1000.0 EUR')).toHaveLength(2)
    expect(screen.getAllByText(
      'Исходная запись: 1000.0 EUR по курсу 1 EUR = 100.2 RUB',
    )).toHaveLength(1)
    expect(screen.queryByText('≈ 5000.0 RUB')).not.toBeInTheDocument()
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

  it('preserves split and import metadata when editing non-money fields', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    const entry: ContributionEntry = {
      id: 'split-active',
      nickname: 'Before edit',
      amountTenths: 18_720,
      currency: 'RUB',
      status: 'active',
      frozenRubTenths: 18_720,
      sourceReference: {
        amountTenths: 20_000,
        currency: 'RUB',
      },
      importReference: {
        provider: 'donationalerts',
        externalId: '99',
        donatedAt: '2026-09-12T10:00:00+00:00',
      },
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

    await user.click(screen.getByRole('button', { name: 'Изменить запись Before edit' }))
    const nickname = screen.getByLabelText('Никнейм')
    await user.clear(nickname)
    await user.type(nickname, 'After edit')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onUpdate).toHaveBeenCalledWith({
      ...entry,
      nickname: 'After edit',
      isChat: false,
    })
  })

  it('drops a stale frozen amount when editing money on a split remainder', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    const entry: ContributionEntry = {
      id: 'split-active',
      nickname: 'Edited amount',
      amountTenths: 18_720,
      currency: 'RUB',
      status: 'active',
      frozenRubTenths: 18_720,
      sourceReference: { amountTenths: 20_000, currency: 'RUB' },
      importReference: {
        provider: 'donationalerts',
        externalId: '99',
        donatedAt: '2026-09-12T10:00:00+00:00',
      },
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

    await user.click(screen.getByRole('button', { name: 'Изменить запись Edited amount' }))
    const amount = screen.getByLabelText('Сумма')
    await user.clear(amount)
    await user.type(amount, '1800')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        amountTenths: 18_000,
        sourceReference: entry.sourceReference,
        importReference: entry.importReference,
      }),
    )
    expect(onUpdate.mock.calls[0]?.[0]).not.toHaveProperty('frozenRubTenths')
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

  it('highlights only regular winners when a regular donation closes the round', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'chat-fund',
        nickname: 'Chat donor',
        amountTenths: 35_000,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 1,
        frozenRubTenths: 35_000,
        isChat: true,
      },
      {
        id: 'smaller',
        nickname: 'Smaller',
        amountTenths: 5_000,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 1,
        frozenRubTenths: 5_000,
      },
      {
        id: 'regular-closer',
        nickname: 'Winner',
        amountTenths: 10_000,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 1,
        frozenRubTenths: 10_000,
      },
    ]

    render(<UsedEntries entries={entries} settings={DEFAULT_SETTINGS} />)
    await user.click(screen.getByRole('button', { name: /ИСТОРИЯ/ }))

    expect(screen.getByText('Winner').closest('.name-cell')).toHaveClass(
      'round-winner',
    )
    expect(screen.getByText('Smaller').closest('.name-cell')).not.toHaveClass(
      'round-winner',
    )
    expect(screen.getByText('Chat donor').closest('.name-cell')).not.toHaveClass(
      'round-winner',
    )
  })

  it('highlights Chat when a Chat donation closes the round', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'regular-largest',
        nickname: 'Largest regular donor',
        amountTenths: 49_000,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 1,
        frozenRubTenths: 49_000,
      },
      {
        id: 'chat-closer',
        nickname: 'Chat closer',
        amountTenths: 1_000,
        currency: 'RUB',
        status: 'consumed',
        roundNumber: 1,
        frozenRubTenths: 1_000,
        isChat: true,
      },
    ]

    render(<UsedEntries entries={entries} settings={DEFAULT_SETTINGS} />)
    await user.click(screen.getByRole('button', { name: /ИСТОРИЯ/ }))

    expect(screen.getByText('Chat closer').closest('.name-cell')).toHaveClass(
      'round-winner',
    )
    expect(
      screen.getByText('Largest regular donor').closest('.name-cell'),
    ).not.toHaveClass('round-winner')
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

    expect(document.querySelector('.used-history-scroll')).toBeInTheDocument()
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

  it('places group expand chevron in reorder-cell beside drag handle and aligns names directly', async () => {
    const user = userEvent.setup()
    const entries: ContributionEntry[] = [
      {
        id: 'solo-1',
        nickname: 'SoloDonor',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'group-1',
        nickname: 'GroupMember1',
        amountTenths: 100,
        currency: 'RUB',
        status: 'active',
      },
      {
        id: 'group-2',
        nickname: 'GroupMember2',
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

    await user.click(screen.getByRole('button', { name: 'Объединить' }))
    await user.click(screen.getByLabelText('Выбрать донат GroupMember1 для объединения'))
    await user.click(screen.getByLabelText('Выбрать донат GroupMember2 для объединения'))
    await user.click(screen.getByRole('button', { name: 'Объединить выбранные' }))

    const mergedRow = document.querySelector('.merged-row')
    expect(mergedRow).toBeInTheDocument()

    // Expand toggle (with chevron) is located inside .reorder-cell next to .drag-handle
    const reorderCell = mergedRow?.querySelector('.reorder-cell')
    const dragHandle = reorderCell?.querySelector('.drag-handle')
    const expandToggle = reorderCell?.querySelector('.group-expand-toggle')
    expect(dragHandle).toBeInTheDocument()
    expect(expandToggle).toBeInTheDocument()
    expect(expandToggle?.querySelector('.chevron')).toBeInTheDocument()
    expect(expandToggle).toHaveAttribute('aria-label', 'Раскрыть группу GroupMember1')

    // Name cell starts directly with entry-nickname (no inline chevron)
    const mergedNameCell = mergedRow?.querySelector('.name-cell')
    expect(mergedNameCell?.querySelector('.entry-nickname')?.textContent).toBe('GroupMember1')
    expect(mergedNameCell?.querySelector('.chevron')).toBeNull()

    // Solo row also has entry-nickname directly inside .name-cell
    const soloRow = document.querySelector('.active-row:not(.merged-row)')
    const soloNameCell = soloRow?.querySelector('.name-cell')
    expect(soloNameCell?.querySelector('.entry-nickname')?.textContent).toBe('SoloDonor')
    expect(soloNameCell?.querySelector('.chevron')).toBeNull()

    // Clicking the name-cell toggles expansion
    await user.click(mergedNameCell!)
    expect(expandToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Донаты группы GroupMember1')).toBeInTheDocument()

    // Clicking again collapses
    await user.click(mergedNameCell!)
    expect(expandToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Донаты группы GroupMember1')).not.toBeInTheDocument()
  })
})
