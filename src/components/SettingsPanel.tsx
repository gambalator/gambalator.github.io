import { useEffect, useMemo, useState } from 'react'
import {
  ADDITIONAL_CURRENCY_RATES,
  CURRENCY_RATES,
  PRIMARY_CURRENCY_RATES,
  type CurrencyRateDefinition,
  type RateSetting,
} from '../domain/currencies'
import { formatTenths, parseTenths } from '../domain/money'
import type { Settings } from '../types'

interface SettingsPanelProps {
  settings: Settings
  onUpdate: (settings: Settings) => void
  onDirtyChange: (dirty: boolean) => void
}

type RateDrafts = Record<RateSetting, string>

function rateDraftsFrom(settings: Settings): RateDrafts {
  return Object.fromEntries(
    CURRENCY_RATES.map((definition) => [
      definition.setting,
      formatTenths(settings[definition.setting]),
    ]),
  ) as RateDrafts
}

export function SettingsPanel({
  settings,
  onUpdate,
  onDirtyChange,
}: SettingsPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [allCurrenciesExpanded, setAllCurrenciesExpanded] = useState(false)
  const [roundDraft, setRoundDraft] = useState(
    formatTenths(settings.roundTargetTenths),
  )
  const [rateDrafts, setRateDrafts] = useState(() => rateDraftsFrom(settings))
  const [roundError, setRoundError] = useState('')
  const [ratesError, setRatesError] = useState('')

  const dirty = useMemo(() => {
    return (
      parseTenths(roundDraft) !== settings.roundTargetTenths ||
      CURRENCY_RATES.some(
        (definition) =>
          parseTenths(rateDrafts[definition.setting]) !== settings[definition.setting],
      )
    )
  }, [rateDrafts, roundDraft, settings])

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

  const updateRateDraft = (setting: RateSetting, value: string) => {
    setRateDrafts((current) => ({ ...current, [setting]: value }))
  }

  const saveRates = () => {
    const parsedRates = new Map<RateSetting, number>()
    for (const definition of CURRENCY_RATES) {
      const parsed = parseTenths(rateDrafts[definition.setting])
      if (parsed === null || parsed <= 0) {
        setRatesError('Все курсы должны быть больше 0 и иметь не более одного знака.')
        return
      }
      parsedRates.set(definition.setting, parsed)
    }

    const nextSettings = { ...settings }
    for (const [setting, value] of parsedRates) nextSettings[setting] = value
    setRatesError('')
    setRateDrafts(rateDraftsFrom(nextSettings))
    onUpdate(nextSettings)
  }

  const rateRow = (definition: CurrencyRateDefinition) => (
    <div className="rate-row" key={definition.currency}>
      <span>{definition.units} {definition.currency}</span>
      <span className="equals">=</span>
      <input
        aria-label={`Курс ${definition.currency}`}
        value={rateDrafts[definition.setting]}
        onChange={(event) => updateRateDraft(definition.setting, event.target.value)}
        inputMode="decimal"
        aria-invalid={Boolean(ratesError)}
      />
      <span>RUB</span>
    </div>
  )

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
          <div className="rates-copy">
            <p className="setting-label">Курсы валют</p>
            <p className="setting-hint">Стоимость указанного количества в рублях</p>
          </div>

          <div className="rates-editor">
            <div className="rate-list">
              {PRIMARY_CURRENCY_RATES.map(rateRow)}
            </div>
            <button
              className="currency-rates-toggle"
              type="button"
              aria-expanded={allCurrenciesExpanded}
              onClick={() => setAllCurrenciesExpanded((value) => !value)}
            >
              {allCurrenciesExpanded ? 'СКРЫТЬ ДОПОЛНИТЕЛЬНЫЕ ВАЛЮТЫ' : 'ОТКРЫТЬ ВСЕ ВАЛЮТЫ'}
              <span
                className={`chevron${allCurrenciesExpanded ? ' open' : ''}`}
                aria-hidden="true"
              >⌄</span>
            </button>
            {allCurrenciesExpanded && (
              <div className="rate-list additional-rate-list">
                {ADDITIONAL_CURRENCY_RATES.map(rateRow)}
              </div>
            )}
            {ratesError && <p className="field-error">{ratesError}</p>}
            <button
              className="button secondary save-rates-button"
              type="button"
              onClick={saveRates}
            >
              Сохранить курсы
            </button>
          </div>
        </div>
      </div>}
    </section>
  )
}
