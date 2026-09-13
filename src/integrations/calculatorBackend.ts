import type { AppState } from '../types'

export interface CalculatorResponse {
  state: AppState
  revision: number
  calculation?: {
    completedRounds: number
    remainingNeededTenths: number
  }
}

async function parseResponse(response: Response): Promise<CalculatorResponse> {
  if (!response.ok) throw new Error(`Calculator backend returned ${response.status}`)
  const value = await response.json() as Partial<CalculatorResponse>
  if (
    typeof value.revision !== 'number' ||
    typeof value.state !== 'object' ||
    value.state === null ||
    !Array.isArray(value.state.entries) ||
    !Array.isArray(value.state.history)
  ) {
    throw new Error('Calculator backend returned an invalid state')
  }
  return value as CalculatorResponse
}

export async function fetchCalculatorState(
  signal?: AbortSignal,
): Promise<CalculatorResponse> {
  return parseResponse(await fetch('/api/calculator/state', {
    headers: { Accept: 'application/json' },
    signal,
  }))
}

export async function sendCalculatorAction(
  action: object,
): Promise<CalculatorResponse> {
  return parseResponse(await fetch('/api/calculator/actions', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(action),
  }))
}
