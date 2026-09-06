import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acknowledgeDonation,
  donationSourceId,
  donationToEntry,
  fetchPendingDonations,
  type PendingDonation,
} from '../src/integrations/donationAlerts'

function pending(values: Partial<PendingDonation> = {}): PendingDonation {
  return {
    source: 'donationalerts',
    sourceId: '190373259',
    username: 'Chel_1',
    amountTenths: 2_000,
    originalAmount: '200',
    currency: 'RUB',
    donatedAt: '2026-09-06 10:20:23',
    fetchedAt: '2026-09-06T10:20:28+00:00',
    isChat: false,
    supportedCurrency: true,
    ...values,
  }
}

describe('DonationAlerts frontend integration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('converts a supported pending donation into an active entry', () => {
    const entry = donationToEntry(pending())

    expect(entry).toMatchObject({
      id: 'donationalerts:190373259',
      nickname: 'Chel_1',
      amountTenths: 2_000,
      currency: 'RUB',
      isChat: false,
      status: 'active',
      importReference: {
        provider: 'donationalerts',
        externalId: '190373259',
      },
    })
    expect(entry && donationSourceId(entry)).toBe('190373259')
  })

  it('preserves automatic Chat attribution from the backend', () => {
    expect(donationToEntry(pending({ isChat: true }))).toMatchObject({
      nickname: 'Chel_1',
      isChat: true,
    })
  })

  it('imports every documented DonationAlerts output currency', () => {
    expect(
      donationToEntry(
        pending({ currency: 'KZT', supportedCurrency: true }),
      ),
    ).toMatchObject({ currency: 'KZT' })
  })

  it('leaves undocumented currencies pending', () => {
    expect(
      donationToEntry(
        pending({ currency: 'GBP', supportedCurrency: false }),
      ),
    ).toBeNull()
  })

  it('loads pending donations from the local backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [pending()], count: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(fetchPendingDonations()).resolves.toEqual([pending()])
    expect(fetch).toHaveBeenCalledWith(
      '/api/donations/pending?limit=500',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('acknowledges an imported donation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    await acknowledgeDonation('190373259')

    expect(fetch).toHaveBeenCalledWith(
      '/api/donations/190373259/acknowledge',
      { method: 'POST', headers: { Accept: 'application/json' } },
    )
  })
})
