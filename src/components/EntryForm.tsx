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
  const [expanded, setExpanded] = useState(false)
  const [nickname, setNickname] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('RUB')
  const [isChat, setIsChat] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (expanded) nicknameRef.current?.focus()
  }, [expanded])

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

  const toggleExpanded = () => {
    setExpanded((current) => !current)
  }

  return (
    <div className={`entry-form-section${expanded ? ' expanded' : ''}`}>
      <button
        className="entry-form-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls="manual-entry-form"
        onClick={toggleExpanded}
      >
        <span className="entry-form-title">Добавить донат вручную</span>
        <span className="toggle-label">{expanded ? 'Свернуть' : 'Развернуть'}</span>
        <span className={`chevron${expanded ? ' open' : ''}`} aria-hidden="true">⌄</span>
      </button>

      {expanded && (
        <form className="entry-form" id="manual-entry-form" onSubmit={submit}>
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
      )}
    </div>
  )
}
