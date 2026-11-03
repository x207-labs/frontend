import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildWithdrawIntentsBalanceCall, JOIN_STORAGE_DEPOSIT, MAX_OPEN_INTENTS_PER_MEMBER, PRUNE_MAX_ITEMS_PER_CALL } from '@x207/core'
import { describe, expect, it } from 'vitest'
import { rpcResult, type FixtureReply } from '../api/fixtures'
import { CONTRACT_ID } from '../config'
import { renderApp, type Override } from '../test/render'
import { createMockWallet } from '../test/walletMock'
import { pruneEpochTx, removeIntentTx, withdrawIntentsBalanceTx } from '../wallet/transactions'

const SCRAPER = 'scraper.x207-circle.near'
const NEW_ACCOUNT = 'newagent.x207-circle.near'

/** Answers `call_function` views of the contract from a table of handlers; other calls fall through to the fixtures. */
const views = (table: Record<string, (args: Record<string, unknown>) => unknown>): Override => (_path, init) => {
  if (init?.method !== 'POST' || init.body === undefined) return undefined
  const body = JSON.parse(String(init.body))
  if (body.params?.request_type !== 'call_function') return undefined
  const handler = table[body.params.method_name]
  return handler ? rpcResult(handler(JSON.parse(atob(body.params.args_base64)))) : undefined
}
const combine = (...overrides: Override[]): Override => (path, init) => {
  for (const override of overrides) {
    const reply: FixtureReply | undefined = override(path, init)
    if (reply) return reply
  }
  return undefined
}

describe('interface 0.0.9 in the frontend', () => {
  it('TC-FE-090-01 the transactions are the ones the SDK builds: gas, deposit and arguments', () => {
    const core = buildWithdrawIntentsBalanceCall(CONTRACT_ID)
    expect(withdrawIntentsBalanceTx()).toMatchObject({ receiverId: CONTRACT_ID, methodName: 'withdraw_intents_balance', args: {}, gas: core.gas!.toString(), deposit: core.deposit.toString() })
    expect(removeIntentTx('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrZb9rXzFaVzJ')).toMatchObject({ methodName: 'remove_intent', args: { intent_hash: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrZb9rXzFaVzJ' }, deposit: '0' })
    expect(pruneEpochTx(41)).toMatchObject({ methodName: 'prune_epoch', args: { epoch: 41, max_items: PRUNE_MAX_ITEMS_PER_CALL }, deposit: '0' })
    expect(BigInt(pruneEpochTx(41).gas)).toBeGreaterThanOrEqual(100n * 10n ** 12n)
  })

  it('TC-FE-090-02 settlement: no Intents balance, the button is off and the page says nothing waits', async () => {
    renderApp('/settlement', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    expect(await screen.findByText(/Tidak ada yang menunggu/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tarik saldo Intents/ })).toBeDisabled()
  })

  it('TC-FE-090-03 settlement: a balance is shown, the claim warning is written, and anybody can withdraw it with 150 Tgas', async () => {
    const wallet = createMockWallet(SCRAPER, SCRAPER)
    const history: Override = (p) =>
      p.includes('/intents/withdrawals')
        ? { status: 200, body: { circle: 'agents-main', unit: 'credit', decimals: 6, totalWithdrawn: '3000000', withdrawals: 2, items: [{ amount: '1500000', changedBlock: 77, receiptId: 'r2' }, { amount: '1500000', changedBlock: 60, receiptId: 'r1' }], nextCursor: null } }
        : undefined
    renderApp('/settlement', combine(history, views({ intents_balance: () => '1500000' })), false, wallet)
    const section = await screen.findByRole('region', { name: 'Saldo Intents yang belum ditarik' })
    expect(await within(section).findByText('1,5')).toBeInTheDocument()
    expect(section).toHaveTextContent(/klaim bisa gagal sampai saldo ini\s+ditarik/)
    expect(await within(section).findByTestId('withdrawal-history')).toHaveTextContent(/Sudah ditarik 2 kali, total 3 USDT\. Terakhir 1,5 USDT di blok 77/)
    const button = within(section).getByRole('button', { name: /Tarik saldo Intents/ })
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.setup().click(button)
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    expect(wallet.txs[0]).toMatchObject({ receiverId: CONTRACT_ID, methodName: 'withdraw_intents_balance', args: {}, gas: String(150n * 10n ** 12n), deposit: '0', signerId: SCRAPER })
  })

  it('TC-FE-090-04 marketplace: own intents from the read API (posted minus removed), the count of 64, remove sends remove_intent', async () => {
    const book = (hash: string) => ({
      intentHash: hash.toLowerCase().padEnd(64, '0'), intentHashBase58: hash, account: SCRAPER, offer: { service: 'translate', calls: 10, value: '200000' },
      need: { service: 'summarize', calls: 5, value: '100000' }, expiresAt: '2026-11-10T00:00:00Z', status: 'open',
      onchain: { method: 'post_intent', args: { intent_hash: hash }, posted: true },
    })
    const described = 'AAAAheld1111111111111111111111111111111111'
    const bare = 'BBBBbare1111111111111111111111111111111111'
    const hashes = (hash: string) => ({ intentHash: hash, accountId: SCRAPER, status: 'posted', postedAtNs: '1', changedBlock: 10 })
    const wallet = createMockWallet(SCRAPER, SCRAPER)
    const api: Override = (p) => {
      if (p.includes('/intents/hashes?')) {
        expect(p).toContain('status=posted')
        expect(p).toContain(`account=${SCRAPER}`)
        return { status: 200, body: { circle: 'agents-main', items: [hashes(described), hashes(bare)], nextCursor: null } }
      }
      if (p.includes('/intents?')) return { status: 200, body: { items: [book(described)], nextCursor: null } }
      return undefined
    }
    renderApp('/marketplace', api, false, wallet)
    const section = await screen.findByRole('region', { name: 'Intent barter saya' })
    await waitFor(() => expect(within(section).getByTestId('intent-count')).toHaveTextContent(`2 dari ${MAX_OPEN_INTENTS_PER_MEMBER} intent terbuka`))
    expect(within(section).getByText(/Tanpa catatan di buku intent off-chain/)).toBeInTheDocument()
    expect(await within(section).findByText(/Tawar 10 panggilan/)).toBeInTheDocument()
    const buttons = within(section).getAllByRole('button', { name: 'Hapus dari kontrak' })
    expect(buttons).toHaveLength(2)
    await userEvent.setup().click(buttons[0]!)
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    expect(wallet.txs[0]).toMatchObject({ methodName: 'remove_intent', args: { intent_hash: described }, deposit: '0', signerId: SCRAPER })
  })

  it('TC-FE-090-04b marketplace: no intent posted shows the empty text with the limit', async () => {
    renderApp('/marketplace', undefined, false, createMockWallet(SCRAPER, SCRAPER))
    const section = await screen.findByRole('region', { name: 'Intent barter saya' })
    expect(await within(section).findByText(/Tidak ada intent terpasang di kontrak/)).toBeInTheDocument()
  })

  it('TC-FE-090-05 report: an epoch that is not finalized cannot be pruned, a finalized one can, with the pair status from the contract', async () => {
    const wallet = createMockWallet(SCRAPER, SCRAPER)
    const open = renderApp('/laporan?epoch=42', undefined, false, wallet)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Pangkas epoch' })).toHaveTextContent(/belum finalized.*ERR_NOT_FINALIZED/))
    expect(screen.queryByRole('button', { name: /Pangkas epoch/ })).not.toBeInTheDocument()
    open.unmount()

    renderApp('/laporan?epoch=41', undefined, false, wallet)
    await waitFor(() => expect(screen.getByTestId('prune-status')).toHaveTextContent(/belum dipangkas/))
    const button = await screen.findByRole('button', { name: 'Pangkas epoch 41' })
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.setup().click(button)
    await waitFor(() => expect(wallet.txs).toHaveLength(1))
    expect(wallet.txs[0]).toMatchObject({ methodName: 'prune_epoch', args: { epoch: 41, max_items: 200 }, deposit: '0', signerId: SCRAPER })
  })

  it('TC-FE-090-06 report: a pruned epoch says that its pairs are gone and that claims are unchanged', async () => {
    renderApp('/laporan?epoch=41', views({ list_obligations: () => [] }), false, createMockWallet(SCRAPER, SCRAPER))
    await waitFor(() => expect(screen.getByTestId('prune-status')).toHaveTextContent(/sudah dihapus dari kontrak/))
    expect(screen.getByRole('region', { name: 'Pangkas epoch' })).toHaveTextContent(/klaim, dan laporan 207 tidak berubah/)
  })

  it('TC-FE-090-07 onboarding: the join deposit is read from @x207/core and the page says that it is kept on exit', async () => {
    renderApp('/onboarding', undefined, false, createMockWallet(NEW_ACCOUNT, NEW_ACCOUNT))
    const note = await screen.findByTestId('join-deposit')
    expect(note).toHaveTextContent('0.32 NEAR')
    expect(note).toHaveTextContent('tidak kembali saat keluar')
    expect(JOIN_STORAGE_DEPOSIT).toBe(32n * 10n ** 22n)
  })
})
