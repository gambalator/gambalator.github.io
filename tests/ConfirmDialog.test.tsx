import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '../src/components/ConfirmDialog'

describe('ConfirmDialog', () => {
  it('exposes the confirmation as an accessible in-app dialog', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <ConfirmDialog
        title="Очистить все записи?"
        message="История и настройки сохранятся."
        confirmLabel="Очистить"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('alertdialog')).toHaveClass('confirm-dialog')
    await user.click(screen.getByRole('button', { name: 'Очистить' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('can be dismissed with Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()

    render(
      <ConfirmDialog
        title="Удалить?"
        message="Проверка"
        confirmLabel="Удалить"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

