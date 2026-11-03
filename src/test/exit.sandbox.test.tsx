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

declare const process: { env: Record<string, string | undefined>; stderr: { write(text: string): void }; cwd(): string }
const enabled = process.env.X207_SANDBOX === '1'
// Jalur ke repo saudara dalam variabel: tsc frontend tidak boleh ikut memeriksa backend dan sdk (aturan sintaks TS yang berbeda); tipenya `any`.
// vitest jalan dari folder frontend; umbrella = satu tingkat di atasnya
const UMBRELLA = process.cwd().replace(/\/frontend$/, '')
const SIBLINGS = {
  sandbox: `${UMBRELLA}/sdk/test-support/sandbox.ts`,
  circle: `${UMBRELLA}/sdk/test-support/circle.ts`,
  core: `${UMBRELLA}/sdk/packages/core/src/index.ts`,
  backend: `${UMBRELLA}/backend/src/index.ts`,
  keeper: `${UMBRELLA}/scripts/lib/keeper.mjs`,
} as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (path: string): Promise<any> => import(/* @vite-ignore */ `/@fs${path}`)

describe.skipIf(!enabled)('FE-018 exit and withdraw stake from the UI to near-sandbox', () => {
  const cleanup: Array<() => Promise<void> | void> = []
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn()
  })

  it('TC-FE-018-08 request_exit then withdraw_stake from the UI button, stake returns and status is exited', async (ctx) => {
    const { sandboxAvailable } = await load(SIBLINGS.sandbox)
    if (!sandboxAvailable) return ctx.skip()
    const { deployCircle, TERMS_HASH } = await load(SIBLINGS.circle)
    const core = await load(SIBLINGS.core)
    const backend = await load(SIBLINGS.backend)
    const { keeperPass } = await load(SIBLINGS.keeper)

    const fx = await deployCircle()
    cleanup.push(() => fx.stop())
    const contract = fx.circle.accountId
    const keeper = await fx.sandbox.createAccount('keeper', '20')
    const account = await fx.member('translator')
    const view = core.createCircleViewFn({ circleContract: contract, rpcUrls: [fx.sandbox.rpcUrl] })
    await core.onboardMember(
      {
        sendCall: async (c: unknown) => {
          const r = await account.call(c)
          if (r.failures.length > 0) throw new Error(r.failures.join('; '))
          return r.value
        },
        view, pollIntervalMs: 200, timeoutMs: 30_000,
      },
      { circleContract: contract, circleId: fx.circleId, accountId: account.accountId, termsHash: TERMS_HASH, stakeAmount: '50000000', usdtTokenId: fx.usdt.accountId },
    )
    const usdt = async () => BigInt((await fx.sandbox.view(fx.usdt.accountId, 'ft_balance_of', { account_id: account.accountId })) as string)
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
    const apiUrl = `http://127.0.0.1:${(api.address() as { port: number }).port}`
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
        throw new Error('not used')
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
    const memberView = () => fx.sandbox.view(contract, 'member', { account_id: account.accountId }) as Promise<{ status: string; stake: string; exit_requested_epoch: number | null }>

    // 1. request_exit dari tombol
    await user.click(await screen.findByRole('button', { name: 'Request exit', hidden: false }, { timeout: 60_000 }))
    await waitFor(() => expect(sent.map((s) => s.method)).toEqual(['request_exit']), { timeout: 30_000 })
    expect((await memberView()).exit_requested_epoch).toBe(1)
    expect(await screen.findByText(/Exit requested in epoch 1/, undefined, { timeout: 60_000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Withdraw stake/ })).toBeDisabled()

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
    const epochView = (epoch: number) => fx.sandbox.view(contract, 'get_epoch', { epoch }) as Promise<Record<string, string | null>>
    for (const deadline of ['cutoff_at', 'proposal_deadline', 'payment_deadline']) {
      await fx.sandbox.advanceTo(Number(BigInt((await epochView(1))[deadline]!) / 1_000_000n) + 1_000)
      await new Promise((r) => setTimeout(r, 3_000))
      await pass()
    }
    expect((await epochView(1)).phase).toBe('finalized')

    // 3. UI melihat epoch finalized lewat read API dan membuka tombol tarik stake
    const withdraw = await screen.findByRole('button', { name: /Withdraw stake/ })
    await waitFor(() => expect(withdraw).toBeEnabled(), { timeout: 90_000 })
    await user.click(withdraw)
    await waitFor(() => expect(sent.map((s) => s.method)).toEqual(['request_exit', 'withdraw_stake']), { timeout: 30_000 })

    // 4. kontrak: exited, stake 0, USDT kembali; UI: pesan sudah keluar dari read API
    await waitFor(async () => expect((await memberView()).status).toBe('exited'), { timeout: 30_000 })
    expect((await memberView()).stake).toBe('0')
    await waitFor(async () => expect((await usdt()) - usdtBefore).toBe(50_000_000n), { timeout: 30_000 })
    expect(await screen.findByText(/already left and the stake has been withdrawn/, undefined, { timeout: 90_000 })).toBeInTheDocument()
    process.stderr.write(`FE-018 sandbox: ${sent.map((s) => `${s.method} ${s.hash.slice(0, 8)}`).join(', ')}; USDT +${(await usdt()) - usdtBefore}\n`)
  }, 900_000)
})
