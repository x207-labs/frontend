// FE-018 terhadap near-sandbox: panel keluar dan tarik stake dirender dengan read API nyata (indexer D9 atas kontrak nyata) dan wallet yang menandatangani
// transaksi ke kontrak di near-sandbox. Alur: request_exit dari UI, epoch keluar ditutup sampai finalized oleh keeper, withdraw_stake dari UI,
// stake kembali sebagai USDT dan status anggota `exited`. Hanya jalan di umbrella (`X207_SANDBOX=1`, binary near-sandbox dan wasm kontrak); impor
// ke repo saudara memakai `import()` supaya repo frontend sendirian tetap memuat file ini dan melewatinya.
// Batas (K-60): wallet nyata (NEAR Connect) hanya bisa dites di testnet dengan akun manusia. Di sini yang diganti hanya `WalletPort`; halaman, query,
// pembangun transaksi, dan penanganan hasilnya nyata.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { FunctionCallTx, WalletPort } from '../wallet/types'

const enabled = process.env.X207_SANDBOX === '1'

describe.skipIf(!enabled)('FE-018 keluar dan tarik stake dari UI ke near-sandbox', () => {
  const cleanup: Array<() => Promise<void> | void> = []
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn()
  })

  it('TC-FE-018-08 request_exit lalu withdraw_stake dari tombol UI, stake kembali dan status exited', async (ctx) => {
    const { sandboxAvailable } = await import('../../../sdk/test-support/sandbox.ts')
    if (!sandboxAvailable) return ctx.skip()
    const { deployCircle, TERMS_HASH } = await import('../../../sdk/test-support/circle.ts')
    const core = await import('../../../sdk/packages/core/src/index.ts')
    const backend = await import('../../../backend/src/index.ts')
    const { keeperPass } = await import('../../../scripts/lib/keeper.mjs')

    const fx = await deployCircle()
    cleanup.push(() => fx.stop())
    const contract = fx.circle.accountId
    const keeper = await fx.sandbox.createAccount('keeper', '20')
    const account = await fx.member('translator')
    const view = core.createCircleViewFn({ circleContract: contract, rpcUrls: [fx.sandbox.rpcUrl] })
    await core.onboardMember(
      {
        sendCall: async (c: import('../../../sdk/packages/core/src/index.ts').ContractCall) => {
          const r = await account.call(c)
          if (r.failures.length > 0) throw new Error(r.failures.join('; '))
          return r.value
        },
        view, pollIntervalMs: 200, timeoutMs: 30_000,
      },
      { circleContract: contract, circleId: fx.circleId, accountId: account.accountId, termsHash: TERMS_HASH, stakeAmount: '50000000', usdtTokenId: fx.usdt.accountId },
    )
    const usdt = async () => BigInt((await fx.sandbox.view<string>(fx.usdt.accountId, 'ft_balance_of', { account_id: account.accountId })) as string)
    const usdtBefore = await usdt()

    // read API nyata: indexer atas kontrak di near-sandbox
    const db = backend.openDatabase(':memory:')
    const indexer = new backend.Indexer({
      db, source: new backend.RpcBlockSource(backend.rpcChainReader(new backend.FailoverRpcClient({ endpoints: [fx.sandbox.rpcUrl] })), contract, 1),
      circleId: fx.circleId, contractId: contract, startBlock: 1, fetchParams: () => fx.sandbox.view(contract, 'get_params', {}) as Promise<never>,
    })
    await indexer.bootstrap()
    const api = backend.createApiServer({ db })
    await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => {
      api.closeAllConnections?.()
      api.close()
    })
    const apiUrl = `http://127.0.0.1:${(api.address() as import('node:net').AddressInfo).port}`
    const drainer = setInterval(() => void indexer.drain().catch(() => undefined), 500)
    cleanup.push(() => clearInterval(drainer))

    // konfigurasi frontend dibaca saat modul dimuat
    vi.stubEnv('VITE_X207_API_URL', apiUrl)
    vi.stubEnv('VITE_X207_CIRCLE', fx.circleId)
    vi.stubEnv('VITE_X207_CONTRACT_ID', contract)
    vi.resetModules()
    const { App } = await import('../App')
    const { WalletProvider } = await import('../wallet/WalletContext')

    const sent: Array<{ method: string; hash: string }> = []
    const port: WalletPort = {
      network: 'testnet',
      restore: async () => account.accountId,
      connect: async () => account.accountId,
      disconnect: async () => undefined,
      signMessage: async () => {
        throw new Error('tidak dipakai')
      },
      signAndSend: async (_signer: string, tx: FunctionCallTx) => {
        const r = await account.call(
          { receiverId: tx.receiverId, methodName: tx.methodName, args: tx.args, deposit: BigInt(tx.deposit), gas: BigInt(tx.gas) },
          'EXECUTED_OPTIMISTIC',
        )
        if (r.failures.length > 0) throw new Error(r.failures.join('; '))
        sent.push({ method: tx.methodName, hash: r.hash })
        return { hash: r.hash }
      },
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: 400 } } })
    render(
      <QueryClientProvider client={client}>
        <WalletProvider port={port}>
          <MemoryRouter initialEntries={['/onboarding']}>
            <App />
          </MemoryRouter>
        </WalletProvider>
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    const memberView = () => fx.sandbox.view<{ status: string; stake: string; exit_requested_epoch: number | null }>(contract, 'member', { account_id: account.accountId })

    // 1. request_exit dari tombol
    await user.click(await screen.findByRole('button', { name: 'Minta keluar', hidden: false }, { timeout: 60_000 }))
    await waitFor(() => expect(sent.map((s) => s.method)).toEqual(['request_exit']), { timeout: 30_000 })
    expect((await memberView()).exit_requested_epoch).toBe(1)
    expect(await screen.findByText(/Keluar diminta di epoch 1/, undefined, { timeout: 60_000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tarik stake/ })).toBeDisabled()

    // 2. keeper menutup epoch 1 sampai finalized; waktu blok dimajukan
    const pass = () =>
      keeperPass({
        view: (m: string, a: object) => fx.sandbox.view(contract, m, a),
        chainNowMs: () => fx.sandbox.blockTimestampMs(),
        send: async ({ methodName, args }: { methodName: string; args: object }) => {
          const r = await fx.sandbox.accountFrom(keeper.accountId, keeper.secretKey).call({ receiverId: contract, methodName, args, deposit: 0n, gas: 200_000_000_000_000n }, 'EXECUTED_OPTIMISTIC')
          if (r.failures.length > 0) throw new Error(r.failures.join('; '))
          return r.hash
        },
      }) as Promise<Array<{ method: string; epoch: number }>>
    const epochView = (epoch: number) => fx.sandbox.view<Record<string, string | null>>(contract, 'get_epoch', { epoch })
    for (const deadline of ['cutoff_at', 'proposal_deadline', 'payment_deadline']) {
      await fx.sandbox.advanceTo(Number(BigInt((await epochView(1))[deadline]!) / 1_000_000n) + 1_000)
      await new Promise((r) => setTimeout(r, 3_000))
      await pass()
    }
    expect((await epochView(1)).phase).toBe('finalized')

    // 3. UI melihat epoch finalized lewat read API dan membuka tombol tarik stake
    const withdraw = await screen.findByRole('button', { name: /Tarik stake/ })
    await waitFor(() => expect(withdraw).toBeEnabled(), { timeout: 90_000 })
    await user.click(withdraw)
    await waitFor(() => expect(sent.map((s) => s.method)).toEqual(['request_exit', 'withdraw_stake']), { timeout: 30_000 })

    // 4. kontrak: exited, stake 0, USDT kembali; UI: pesan sudah keluar dari read API
    await waitFor(async () => expect((await memberView()).status).toBe('exited'), { timeout: 30_000 })
    expect((await memberView()).stake).toBe('0')
    await waitFor(async () => expect((await usdt()) - usdtBefore).toBe(50_000_000n), { timeout: 30_000 })
    expect(await screen.findByText(/sudah keluar dan stake sudah ditarik/, undefined, { timeout: 90_000 })).toBeInTheDocument()
    process.stderr.write(`FE-018 sandbox: ${sent.map((s) => `${s.method} ${s.hash.slice(0, 8)}`).join(', ')}; USDT +${(await usdt()) - usdtBefore}\n`)
  }, 900_000)
})
