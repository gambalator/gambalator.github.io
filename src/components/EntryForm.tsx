import { useEffect, useRef, useState, type FormEvent } from 'react'
import { parseTenths } from '../domain/money'
import { CURRENCIES } from '../domain/currencies'
import type { ContributionEntry, Currency } from '../types'
import { ChatToggle } from './ChatToggle'

interface EntryFormProps {
  onAdd: (entry: ContributionEntry) => void
  createId: () => string
}

export function EntryForm({ onAdd, createId }: EntryFormProps) {
  const nicknameRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('RUB')
  const [isChat, setIsChat] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!dialogOpen) return
    nicknameRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setDialogOpen(false)
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [dialogOpen])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cleanNickname = nickname.trim()
    const amountTenths = parseTenths(amount)

    if (!cleanNickname) {
      setError('Введите никнейм.')
      nicknameRef.current?.focus()
      return
    }
    if (amountTenths === null || amountTenths <= 0) {
      setError('Сумма должна быть больше 0 и иметь не более одного знака.')
      return
    }

    onAdd({
      id: createId(),
      nickname: cleanNickname,
      isChat,
      amountTenths,
      currency,
      status: 'active',
    })
    setNickname('')
    setAmount('')
    setCurrency('RUB')
    setIsChat(false)
    setError('')
    requestAnimationFrame(() => nicknameRef.current?.focus())
  }

  const closeDialog = () => {
    setDialogOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div className="manual-entry-control">
      <button
        ref={triggerRef}
        className="manual-entry-open-button"
        type="button"
        aria-label="Добавить донат вручную"
        aria-haspopup="dialog"
        onClick={() => setDialogOpen(true)}
      >
        +
      </button>

      {dialogOpen && (
        <div
          className="dialog-backdrop manual-entry-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog()
          }}
        >
          <section
            className="manual-entry-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-entry-dialog-title"
          >
            <div className="manual-entry-dialog-heading">
              <h2 id="manual-entry-dialog-title">Добавить донат вручную</h2>
              <button
                ref={closeRef}
                className="history-dialog-close"
                type="button"
                aria-label="Закрыть добавление доната"
                onClick={closeDialog}
              >
                ×
              </button>
            </div>
            <form className="entry-form entry-form-dialog" id="manual-entry-form" onSubmit={submit}>
              <div className="field-group nickname-field">
                <label htmlFor="new-nickname">Никнейм</label>
                <input
                  ref={nicknameRef}
                  id="new-nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Например, PivoLover"
                  autoComplete="off"
                />
              </div>
              <div className="field-group amount-field">
                <label htmlFor="new-amount">Сумма</label>
                <input
                  id="new-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.0"
                  inputMode="decimal"
                />
              </div>
              <div className="field-group currency-field">
                <label htmlFor="new-currency">Валюта</label>
                <select
                  id="new-currency"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as Currency)}
                >
                  {CURRENCIES.map((option) => (
                    <option value={option} key={option}>{option}</option>
                  ))}
                </select>
              </div>
              <ChatToggle
                checked={isChat}
                label="Считать новый донат как донат от Chat"
                onChange={setIsChat}
              />
              <button className="button primary add-button" type="submit">
                ДОБАВИТЬ
              </button>
              {error && <p className="form-error">{error}</p>}
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
