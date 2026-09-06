import { isCurrency } from '../domain/currencies'
import type { ContributionEntry } from '../types'

export interface PendingDonation {
  source: 'donationalerts'
  sourceId: string
  username: string
  amountTenths: number
  originalAmount: string
  currency: string
  donatedAt: string | null
  fetchedAt: string
  isChat: boolean
  supportedCurrency: boolean
}

interface PendingDonationResponse {
  data: PendingDonation[]
  count: number
}

function isPendingDonation(value: unknown): value is PendingDonation {
  if (!value || typeof value !== 'object') return false
  const donation = value as Partial<PendingDonation>
  return (
    donation.source === 'donationalerts' &&
    typeof donation.sourceId === 'string' &&
    donation.sourceId.length > 0 &&
    typeof donation.username === 'string' &&
    Number.isSafeInteger(donation.amountTenths) &&
    (donation.amountTenths ?? 0) > 0 &&
    typeof donation.originalAmount === 'string' &&
    typeof donation.currency === 'string' &&
    (donation.donatedAt === null || typeof donation.donatedAt === 'string') &&
    typeof donation.fetchedAt === 'string' &&
    typeof donation.isChat === 'boolean' &&
    typeof donation.supportedCurrency === 'boolean'
  )
}

export async function fetchPendingDonations(
  signal?: AbortSignal,
): Promise<PendingDonation[]> {
  const response = await fetch('/api/donations/pending?limit=500', {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const payload = (await response.json()) as Partial<PendingDonationResponse>
  if (!Array.isArray(payload.data) || !payload.data.every(isPendingDonation)) {
    throw new Error('DonationAlerts returned invalid pending donations')
  }
  return payload.data
}

export function donationToEntry(
  donation: PendingDonation,
): ContributionEntry | null {
  if (
    !donation.supportedCurrency ||
    !isCurrency(donation.currency)
  ) {
    return null
  }

  return {
    id: `donationalerts:${donation.sourceId}`,
    nickname: donation.username.trim() || 'Аноним',
    amountTenths: donation.amountTenths,
    currency: donation.currency,
    isChat: donation.isChat,
    status: 'active',
    importReference: {
      provider: 'donationalerts',
      externalId: donation.sourceId,
      donatedAt: donation.donatedAt,
    },
  }
}

export function donationSourceId(entry: ContributionEntry): string | null {
  return entry.importReference?.provider === 'donationalerts'
    ? entry.importReference.externalId
    : null
}

export async function acknowledgeDonation(sourceId: string): Promise<void> {
  const response = await fetch(
    `/api/donations/${encodeURIComponent(sourceId)}/acknowledge`,
    { method: 'POST', headers: { Accept: 'application/json' } },
  )
  if (!response.ok && response.status !== 404) {
    throw new Error(`HTTP ${response.status}`)
  }
}
