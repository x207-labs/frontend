// FE-068: the account service client, Settings, the saved onboarding progress and the feedback button. `fetch` is stubbed by renderApp; nothing reaches the real function.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FixtureReply } from '../api/fixtures'
import { renderApp } from '../test/render'
import { createMockWallet, type MockWallet } from '../test/walletMock'
import { resetCache } from './cache'
import { ACCOUNT_RECIPIENT, ACCOUNT_URL, AccountError, accountErrorMessage, makeNonce, toBase64 } from './client'
import { onboardingPayload } from './onboardingSync'
import { resetSigning } from './useAccount'
import { buildCsp } from '../lib/csp'
import { readProgress } from '../onboarding/progress'

const ACCOUNT = 'newagent.x207-circle.near'
const FN_PATH = new URL(ACCOUNT_URL).pathname
const row = (over: Record<string, unknown> = {}) => ({ account_id: ACCOUNT, profile: null, onboarding: null, prefs: null, ...over })
const err = (status: number, code: string): FixtureReply => ({ status, body: { error: { code, message: code } } })

type Sent = Record<string, unknown>
function service(reply: (body: Sent) => FixtureReply = () => ({ status: 200, body: row() })) {
  const sent: Sent[] = []
  const override = (path: string, init?: RequestInit): FixtureReply | undefined => {
    if (path !== FN_PATH) return undefined
    const body = JSON.parse(String(init?.body)) as Sent
    sent.push(body)
    return reply(body)
  }
  return { sent, override }
}

beforeEach(() => {
  localStorage.clear()
  resetCache()
  resetSigning()
})

async function open(route: string, svc: ReturnType<typeof service>, wallet: MockWallet = createMockWallet(ACCOUNT, ACCOUNT)) {
  renderApp(route, svc.override, false, wallet)
  await screen.findByRole('button', { name: /Account menu/ })
  return { user: userEvent.setup(), wallet }
}

describe('TC-FE-068-01 helpers', () => {
  it('the nonce is 32 bytes: 8 bytes of time in ms (big endian), then 24 random bytes; sent as base64', () => {
    const nonce = makeNonce(1_700_000_000_123, (n) => new Uint8Array(n).fill(7))
    expect(nonce).toHaveLength(32)
    expect(new DataView(nonce.buffer).getBigUint64(0, false)).toBe(1_700_000_000_123n)
    expect([...nonce.slice(8)]).toEqual(Array(24).fill(7))
    expect(atob(toBase64(nonce))).toHaveLength(32)
    expect(makeNonce()).not.toEqual(makeNonce())
  })
  it('every error code of the function has a sentence; unknown ones do not leak the raw code', () => {
    for (const code of ['rate_limited', 'nonce_expired', 'nonce_used', 'key_not_owned', 'invalid_signature', 'bad_signature_format', 'bad_public_key', 'wrong_message', 'wrong_recipient', 'rpc_unavailable', 'invalid_request', 'payload_too_large', 'internal_error']) {
      expect(accountErrorMessage(new AccountError(400, code, 'raw'))).toMatch(/^[A-Z].*[.]$/)
    }
    expect(accountErrorMessage(new AccountError(500, 'weird', 'raw'))).not.toContain('weird')
    expect(accountErrorMessage(new TypeError('Failed to fetch'))).toContain('could not be reached')
  })
  it('the onboarding payload uses the field names of the service', () => {
    expect(onboardingPayload({ funds: true, payment: false }, { kind: 'none' })).toEqual({ wallet_created: true, funds_received: true, joined: false, staked: false, tour_done: false })
    expect(onboardingPayload({ funds: false, payment: true }, { kind: 'member', member: { stake: '5', outstandingDebt: '0', settledHistory: '0' } })).toMatchObject({ joined: true, staked: true, tour_done: true })
  })
  it('the CSP lets the page connect to the account service', () => {
    expect(buildCsp({ VITE_X207_API_URL: 'https://x207.boxd.sh' })).toContain('https://vldhsabgpfxccsljdtye.supabase.co')
  })
})

describe('TC-FE-068-02 Settings', () => {
  it('opening the page asks for no signature and calls nothing', async () => {
    const svc = service()
    const { wallet } = await open('/settings', svc)
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(wallet.messages).toHaveLength(0)
    expect(svc.sent).toHaveLength(0)
  })

  it('Save name: one signature of "x207:upsert_profile" for x207.vercel.app, the fields the function wants, and the name shows in the shell', async () => {
    const svc = service((b) => ({ status: 200, body: row({ profile: { display_name: (b.data as Sent).display_name } }) }))
    const { user, wallet } = await open('/settings', svc)
    await user.type(await screen.findByLabelText('Display name'), '  Ana  ')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('Name saved.')).toBeInTheDocument()
    expect(wallet.messages).toHaveLength(1)
    expect(wallet.messages[0]).toMatchObject({ message: 'x207:upsert_profile', recipient: ACCOUNT_RECIPIENT, signerId: ACCOUNT })
    expect(wallet.messages[0].nonce).toHaveLength(32)
    expect(Math.abs(Number(new DataView(wallet.messages[0].nonce.buffer, wallet.messages[0].nonce.byteOffset).getBigUint64(0, false)) - Date.now())).toBeLessThan(10_000)
    expect(svc.sent).toHaveLength(1)
    expect(svc.sent[0]).toMatchObject({
      action: 'upsert_profile', data: { display_name: 'Ana' }, accountId: ACCOUNT, publicKey: 'ed25519:MOCKKEY', signature: 'sig1',
      message: 'x207:upsert_profile', recipient: 'x207.vercel.app',
    })
    expect(atob(String(svc.sent[0].nonce))).toHaveLength(32)
    expect(within(screen.getByRole('button', { name: /Account menu/ })).getByText('Ana')).toBeInTheDocument()
  })

  it('Save preferences: an empty email is sent as null; the reminder flag goes along', async () => {
    const svc = service()
    const { user } = await open('/settings', svc)
    await user.click(await screen.findByLabelText(/Remind me/))
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))
    expect(await screen.findByText('Preferences saved.')).toBeInTheDocument()
    expect(svc.sent[0]).toMatchObject({ action: 'upsert_prefs', data: { email: null, deadline_reminder: true } })
  })

  it('a bad email blocks the button', async () => {
    const svc = service()
    const { user } = await open('/settings', svc)
    await user.type(await screen.findByLabelText(/Email/), 'nope')
    expect(screen.getByRole('alert')).toHaveTextContent('does not look like an email')
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled()
  })

  it('Load from my account signs "x207:get" and fills the form from the answer', async () => {
    const svc = service(() => ({ status: 200, body: row({ profile: { display_name: 'Ana' }, prefs: { email: 'a@b.co', deadline_reminder: true } }) }))
    const { user, wallet } = await open('/settings', svc)
    await user.click(await screen.findByRole('button', { name: 'Load from my account' }))
    expect(await screen.findByText('Loaded from your account.')).toBeInTheDocument()
    expect(wallet.messages[0].message).toBe('x207:get')
    expect(screen.getByLabelText('Display name')).toHaveValue('Ana')
    expect(screen.getByLabelText(/Email/)).toHaveValue('a@b.co')
    expect(screen.getByLabelText(/Remind me/)).toBeChecked()
  })

  it('a declined signature saves nothing and says so', async () => {
    const svc = service()
    const wallet = createMockWallet(ACCOUNT, ACCOUNT)
    const { user } = await open('/settings', svc, wallet)
    wallet.rejectNext = true
    await user.type(await screen.findByLabelText('Display name'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancelled in the wallet. Nothing was saved.')
    expect(svc.sent).toHaveLength(0)
  })

  it('a wallet that cannot sign messages: one clear message instead of the form, no call to the service', async () => {
    const svc = service()
    const wallet = createMockWallet(ACCOUNT, ACCOUNT)
    wallet.signMessage = async () => { throw new Error('signMessage is not supported by this wallet') }
    const { user } = await open('/settings', svc, wallet)
    await user.type(await screen.findByLabelText('Display name'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await within(screen.getByRole('main')).findByRole('status')).toHaveTextContent('This wallet cannot sign messages')
    expect(screen.queryByLabelText('Display name')).toBeNull()
    expect(svc.sent).toHaveLength(0)
  })

  it.each([
    [403, 'key_not_owned', 'not a full access key'],
    [401, 'nonce_used', 'too old or already used'],
    [503, 'rpc_unavailable', 'NEAR network did not answer'],
  ])('%s %s shows a sentence', async (status, code, text) => {
    const svc = service(() => err(status, code))
    const { user } = await open('/settings', svc)
    await user.type(await screen.findByLabelText('Display name'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })
})

describe('TC-FE-068-03 onboarding progress is saved to the account', () => {
  it('"I made a payment" is kept locally and sent as one signed upsert_onboarding', async () => {
    const svc = service()
    const { user, wallet } = await open('/onboarding', svc)
    await user.click(await screen.findByRole('button', { name: 'I made a payment' }))
    expect(await screen.findByText('Progress saved to your account.')).toBeInTheDocument()
    expect(readProgress(ACCOUNT).payment).toBe(true)
    expect(wallet.messages.map((m) => m.message)).toEqual(['x207:upsert_onboarding'])
    expect(svc.sent[0]).toMatchObject({ action: 'upsert_onboarding', data: { wallet_created: true, funds_received: false, joined: false, staked: false, tour_done: true } })
  })

  it('a declined signature keeps the local progress and says it is on this device only', async () => {
    const svc = service()
    const wallet = createMockWallet(ACCOUNT, ACCOUNT)
    const { user } = await open('/onboarding', svc, wallet)
    wallet.rejectNext = true
    await user.click(await screen.findByRole('button', { name: 'I made a payment' }))
    expect(await screen.findByTestId('onboarding-saved')).toHaveTextContent('saved on this device only')
    expect(readProgress(ACCOUNT).payment).toBe(true)
    expect(svc.sent).toHaveLength(0)
  })

  it('opening the wizard calls the account service never (the get is Settings only)', async () => {
    const svc = service()
    await open('/onboarding', svc)
    await screen.findByText(/members registered/)
    expect(svc.sent).toHaveLength(0)
  })
})

describe('TC-FE-068-04 feedback button', () => {
  it('sends the message and the page path without any signature', async () => {
    const svc = service(() => ({ status: 201, body: { ok: true, signed: false } }))
    const { user, wallet } = await open('/settings', svc)
    await user.click(screen.getByRole('button', { name: 'Feedback' }))
    await user.type(screen.getByLabelText('What should we know?'), '  The stats page is slow  ')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Thank you, it was sent.')).toBeInTheDocument()
    expect(svc.sent).toEqual([{ action: 'feedback', data: { page: '/settings', message: 'The stats page is slow' } }])
    expect(wallet.messages).toHaveLength(0)
  })

  it('429 shows the rate limit sentence; an empty message cannot be sent', async () => {
    const svc = service(() => err(429, 'rate_limited'))
    const { user } = await open('/stats', svc)
    await user.click(screen.getByRole('button', { name: 'Feedback' }))
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await user.type(screen.getByLabelText('What should we know?'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many messages from your address')
  })

  it('is not on the landing page', async () => {
    renderApp('/')
    await waitFor(() => expect(document.body.textContent).not.toBe(''))
    expect(screen.queryByRole('button', { name: 'Feedback' })).toBeNull()
  })
})
