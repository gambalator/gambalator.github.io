const MOSCOW_OFFSET_MILLISECONDS = 3 * 60 * 60 * 1_000
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function moscowDateTimeLocalValue(date: Date): string {
  const moscow = new Date(date.getTime() + MOSCOW_OFFSET_MILLISECONDS)
  return [
    moscow.getUTCFullYear(),
    '-',
    pad(moscow.getUTCMonth() + 1),
    '-',
    pad(moscow.getUTCDate()),
    'T',
    pad(moscow.getUTCHours()),
    ':',
    pad(moscow.getUTCMinutes()),
  ].join('')
}

export function parseMoscowDateTimeLocal(value: string): Date | null {
  const match = LOCAL_DATE_TIME.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const displayedAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute))

  if (
    displayedAsUtc.getUTCFullYear() !== year ||
    displayedAsUtc.getUTCMonth() !== month - 1 ||
    displayedAsUtc.getUTCDate() !== day ||
    displayedAsUtc.getUTCHours() !== hour ||
    displayedAsUtc.getUTCMinutes() !== minute
  ) {
    return null
  }
  return new Date(displayedAsUtc.getTime() - MOSCOW_OFFSET_MILLISECONDS)
}

export function startOfMoscowDayValue(date: Date): string {
  return `${moscowDateTimeLocalValue(date).slice(0, 10)}T00:00`
}

export function displayMoscowTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })} МСК`
}

export function displayDonationMoscowTime(value: string): string {
  const utcValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  return displayMoscowTime(utcValue)
}
