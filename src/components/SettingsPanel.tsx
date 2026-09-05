import { useEffect, useMemo, useState } from 'react'
import { formatTenths, parseTenths } from '../domain/money'
import type { Settings } from '../types'

interface SettingsPanelProps {
  settings: Settings
  onUpdate: (settings: Settings) => void
  onDirtyChange: (dirty: boolean) => void
}

export function SettingsPanel({
  settings,
  onUpdate,
  onDirtyChange,
}: SettingsPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [roundDraft, setRoundDraft] = useState(
    formatTenths(settings.roundTargetTenths),
  )
  const [eurDraft, setEurDraft] = useState(
    formatTenths(settings.eurRateTenths),
  )
  const [usdDraft, setUsdDraft] = useState(
    formatTenths(settings.usdRateTenths),
  )
  const [roundError, setRoundError] = useState('')
  const [ratesError, setRatesError] = useState('')

  const dirty = useMemo(() => {
    return (
      parseTenths(roundDraft) !== settings.roundTargetTenths ||
      parseTenths(eurDraft) !== settings.eurRateTenths ||
      parseTenths(usdDraft) !== settings.usdRateTenths
    )
  }, [eurDraft, roundDraft, settings, usdDraft])

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const saveRoundTarget = () => {
    const nextTarget = parseTenths(roundDraft)
    if (nextTarget === null || nextTarget <= 0) {
      setRoundError('Введите число больше 0 с одной цифрой после запятой.')
      return
    }

    setRoundError('')
    setRoundDraft(formatTenths(nextTarget))
    onUpdate({ ...settings, roundTargetTenths: nextTarget })
  }

  const saveRates = () => {
    const eurRateTenths = parseTenths(eurDraft)
    const usdRateTenths = parseTenths(usdDraft)
    if (
      eurRateTenths === null ||
      eurRateTenths <= 0 ||
      usdRateTenths === null ||
      usdRateTenths <= 0
    ) {
      setRatesError('Оба курса должны быть больше 0 и иметь не более одного знака.')
      return
    }

    setRatesError('')
    setEurDraft(formatTenths(eurRateTenths))
    setUsdDraft(formatTenths(usdRateTenths))
    onUpdate({ ...settings, eurRateTenths, usdRateTenths })
  }

  return (
    <section
      className={`panel settings-panel${expanded ? ' expanded' : ''}`}
      aria-labelledby="settings-title"
    >
      <button
        className="settings-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls="settings-content"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="settings-toggle-title">
          <span className="settings-component-title" id="settings-title">
            Параметры расчёта
          </span>
        </span>
        <span className="settings-summary">
          Раунд {formatTenths(settings.roundTargetTenths)} RUB
          <span aria-hidden="true">·</span>
          EUR {formatTenths(settings.eurRateTenths)}
          <span aria-hidden="true">·</span>
          USD {formatTenths(settings.usdRateTenths)}
        </span>
        {dirty && <span className="dirty-badge">Не сохранено</span>}
        <span className="toggle-label">{expanded ? 'Свернуть' : 'Развернуть'}</span>
        <span className={`chevron${expanded ? ' open' : ''}`} aria-hidden="true">⌄</span>
      </button>

      {expanded && <div className="settings-grid" id="settings-content">
        <div className="setting-card target-card">
          <div className="target-current-row">
            <p className="setting-label">Текущая сумма раунда</p>
            <p className="target-value">
              {formatTenths(settings.roundTargetTenths)} <span>RUB</span>
            </p>
          </div>

          <div className="field-group target-update-area">
            <label className="sr-only" htmlFor="round-target">Новая сумма раунда</label>
            <div className="target-update-row">
              <div className="input-with-suffix">
                <input
                  id="round-target"
                  value={roundDraft}
                  onChange={(event) => setRoundDraft(event.target.value)}
                  inputMode="decimal"
                  aria-invalid={Boolean(roundError)}
                />
                <span>RUB</span>
              </div>
              <button className="button secondary" type="button" onClick={saveRoundTarget}>
                Обновить
              </button>
            </div>
            {roundError && <p className="field-error">{roundError}</p>}
          </div>
        </div>

        <div className="setting-card rates-card">
          <div>
            <p className="setting-label">Курсы валют</p>
            <p className="setting-hint">Стоимость одной единицы в рублях</p>
          </div>

          <div className="rate-row">
            <span>1 EUR</span>
            <span className="equals">=</span>
            <input
              aria-label="Курс EUR"
              value={eurDraft}
              onChange={(event) => setEurDraft(event.target.value)}
              inputMode="decimal"
              aria-invalid={Boolean(ratesError)}
            />
            <span>RUB</span>
          </div>
          <div className="rate-row">
            <span>1 USD</span>
            <span className="equals">=</span>
            <input
              aria-label="Курс USD"
              value={usdDraft}
              onChange={(event) => setUsdDraft(event.target.value)}
              inputMode="decimal"
              aria-invalid={Boolean(ratesError)}
            />
            <span>RUB</span>
          </div>
          {ratesError && <p className="field-error">{ratesError}</p>}
          <button className="button secondary" type="button" onClick={saveRates}>
            Сохранить курсы
          </button>
        </div>
      </div>}
    </section>
  )
}
