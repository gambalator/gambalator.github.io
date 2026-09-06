import { useEffect, useRef, useState } from 'react'

interface DarkDatePickerProps {
  value: string
  max?: string
  label: string
  onChange: (value: string) => void
}

interface DateParts {
  year: number
  month: number
  day: number
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function parseDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

function monthFromValue(value: string): Date {
  const parts = parseDate(value)
  const fallback = new Date()
  return parts
    ? new Date(Date.UTC(parts.year, parts.month - 1, 1))
    : new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), 1))
}

function dateValue(year: number, monthIndex: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(monthIndex + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function shiftMonth(month: Date, offset: number): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1))
}

function displayDate(value: string): string {
  const parts = parseDate(value)
  if (!parts) return 'Выберите дату'
  return [
    String(parts.day).padStart(2, '0'),
    String(parts.month).padStart(2, '0'),
    parts.year,
  ].join('.')
}

export function DarkDatePicker({
  value,
  max,
  label,
  onChange,
}: DarkDatePickerProps) {
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromValue(value))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const year = visibleMonth.getUTCFullYear()
  const monthIndex = visibleMonth.getUTCMonth()
  const firstWeekday = (visibleMonth.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  const nextMonth = shiftMonth(visibleMonth, 1)
  const maxMonth = max ? monthFromValue(max) : null
  const nextDisabled = maxMonth !== null && nextMonth.getTime() > maxMonth.getTime()

  return (
    <div className="dark-date-picker" ref={rootRef}>
      <button
        className="dark-date-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setVisibleMonth(monthFromValue(value))
          setOpen((current) => !current)
        }}
      >
        <span>{displayDate(value)}</span>
        <svg
          className="dark-date-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <div
          className="dark-date-calendar"
          role="dialog"
          aria-label="Выбор даты повторного импорта"
        >
          <div className="dark-date-calendar-heading">
            <button
              type="button"
              aria-label="Предыдущий месяц"
              onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}
            >
              ‹
            </button>
            <strong>{MONTH_FORMATTER.format(visibleMonth)}</strong>
            <button
              type="button"
              aria-label="Следующий месяц"
              disabled={nextDisabled}
              onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}
            >
              ›
            </button>
          </div>
          <div className="dark-date-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>
          <div className="dark-date-days">
            {cells.map((day, index) => {
              if (day === null) {
                return <span aria-hidden="true" key={`empty-${index}`} />
              }
              const candidate = dateValue(year, monthIndex, day)
              const candidateDate = new Date(Date.UTC(year, monthIndex, day))
              const disabled = max !== undefined && candidate > max
              return (
                <button
                  className={`${candidate === value ? 'selected' : ''}${candidate === max ? ' today' : ''}`}
                  type="button"
                  aria-label={`Выбрать ${FULL_DATE_FORMATTER.format(candidateDate)}`}
                  aria-pressed={candidate === value}
                  disabled={disabled}
                  key={candidate}
                  onClick={() => {
                    onChange(candidate)
                    setOpen(false)
                  }}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
