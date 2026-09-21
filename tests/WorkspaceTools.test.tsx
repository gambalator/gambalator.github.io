import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceTools } from '../src/components/WorkspaceTools'
import { DEFAULT_SETTINGS } from '../src/types'

describe('workspace tools menu', () => {
  it('contains calculation settings without a separate history item', async () => {
    const user = userEvent.setup()
    render(
      <WorkspaceTools
        settings={DEFAULT_SETTINGS}
        onUpdateSettings={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Меню' }))
    expect(screen.queryByRole('menuitem', { name: /История/ })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Параметры расчёта/ })).toBeInTheDocument()
  })

  it('opens settings directly and clears an unsaved draft when closed', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    render(
      <WorkspaceTools
        settings={DEFAULT_SETTINGS}
        onUpdateSettings={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Меню' }))
    await user.click(screen.getByRole('menuitem', { name: /Параметры расчёта/ }))

    expect(screen.getByRole('dialog', { name: 'Параметры расчёта' })).toBeInTheDocument()
    const roundTarget = screen.getByLabelText('Новая сумма раунда')
    await user.clear(roundTarget)
    await user.type(roundTarget, '6000.0')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    await user.click(screen.getByRole('button', { name: 'Закрыть: Параметры расчёта' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })
})
