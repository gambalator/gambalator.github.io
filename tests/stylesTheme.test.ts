import { describe, expect, it } from 'vitest'
import stylesheet from '../src/styles.css?raw'

const rootEnd = stylesheet.indexOf('\n}\n\n* {')
const componentRules = stylesheet.slice(rootEnd + 3)

describe('editable CSS theme', () => {
  it('keeps literal colours in the theme block instead of component rules', () => {
    expect(rootEnd).toBeGreaterThan(0)
    expect(componentRules).not.toMatch(/#[\da-f]{3,8}\b/i)
    expect(componentRules).not.toMatch(/rgba?\(/i)
  })

  it('uses one font weight for every text rule', () => {
    const weights = [...stylesheet.matchAll(/font-weight:\s*([^;]+);/g)]
      .map((match) => match[1])

    expect(new Set(weights)).toEqual(new Set(['var(--font-weight-all)']))
  })

  it('wires searchable control aliases into component rules', () => {
    const aliases = [
      '--button-donation-alerts-off-color',
      '--button-donation-alerts-on-color',
      '--button-chat-all-color',
      '--button-add-donation-color',
      '--button-calculate-all-color',
      '--button-calculate-one-color',
      '--button-manual-entry-color',
      '--button-save-round-color',
      '--button-load-cbr-rates-color',
      '--button-save-rates-color',
      '--button-auto-merge-color',
      '--button-merge-color',
      '--button-order-color',
      '--button-workspace-menu-color',
      '--button-donation-alerts-action-color',
      '--button-import-history-color',
      '--button-edit-color',
      '--button-delete-color',
      '--button-confirm-color',
      '--button-cancel-color',
    ]

    for (const alias of aliases) {
      expect(componentRules, `${alias} is not used`).toContain(`var(${alias})`)
    }
  })

  it('keeps Chat group nickname and toggle yellow on hover', () => {
    expect(componentRules).toMatch(
      /\.active-row\.chat-attributed\s+\.merged-name-cell:not\(\.editing\):hover\s+\.entry-nickname\s*\{\s*color:\s*var\(--yellow\);/i,
    )
    expect(componentRules).toMatch(
      /\.active-row\.chat-attributed\s+\.group-expand-toggle:hover[\s\S]*?color:\s*var\(--yellow\);/i,
    )
  })

  it('keeps connection and last-winner colours independently editable', () => {
    expect(componentRules).toMatch(
      /\.integration-status\.connected\s*\{\s*color:\s*var\(--connection-success\);/i,
    )
    expect(componentRules).toMatch(
      /\.history-last-winner strong\s*\{\s*color:\s*var\(--last-winner-name-color\);/i,
    )
  })

  it('documents component colours with their visible control names', () => {
    expect(stylesheet).toMatch(
      /--button-calculate-all-color:[^;]+;\s*\/\* Кнопка «Рассчитать один»\. \*\//,
    )
    expect(stylesheet).toMatch(
      /--button-auto-merge-color:[^;]+;\s*\/\* Кнопка «Авто: вкл\/выкл»\. \*\//,
    )
  })
})
