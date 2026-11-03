import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { listingHashA, listings } from '../api/fixtures'
import type { AcceptPreview, OfferView } from '../api/types'
import { base58Encode, serializeBundleTerms, sha256Hex, signMessageWithVoucher, signOffer, type Offer } from '../lib/barter'
import { apiError, renderApp, type Override } from '../test/render'
import { createMockWallet } from '../test/walletMock'

const OWNER = 'translator.x207-circle.near'
const BUDI = 'summarizer.x207-circle.near'
const PENCARI = 'scraper.x207-circle.near'
const KEY = `ed25519:${base58Encode(Uint8Array.from(new Array<number>(32).fill(1)))}`
const C = (n: number) => String(n * 1_000_000)

const offer = (over: Partial<OfferView> = {}): OfferView => ({
  offerHash: 'e'.repeat(64), listingHash: listingHashA, proposer: BUDI, counterparty: BUDI, awaiting: OWNER, round: 1, mode: 'barter',
  value: C(100), quantity: 5000, deliverBy: '2026-11-08T10:00:00Z', signature: 'ed25519:x', inReplyTo: null, status: 'pending', ...over,
})

const CIRCLE_ACCOUNT = 'x207-circle.testnet' // CONTRACT_ID of the test configuration
const terms = { circle: CIRCLE_ACCOUNT, epoch: 42, legs: [
  { payer: OWNER, payee: BUDI, max_amount: C(107) },
  { payer: BUDI, payee: OWNER, max_amount: C(100) },
  { payer: OWNER, payee: PENCARI, max_amount: C(3) },
] }
const message = serializeBundleTerms(terms)
const previewBundle = async (over: Partial<AcceptPreview> = {}): Promise<AcceptPreview> => ({
  kind: 'bundle', epoch: 42, mode: 'barter', discountValue: C(10), searcherValue: C(3), searcher: PENCARI,
  breakdown: { mode: 'barter', cashback: C(7), searcher: C(3), sellerBears: C(10), counterpartyGives: C(100) },
  bundle: { termsHash: await sha256Hex(message), message, nonce: 'n', recipient: CIRCLE_ACCOUNT, terms, participants: [BUDI, OWNER, PENCARI] },
  payment: null, ...over,
})

type Calls = Array<{ path: string; body: any }>
function backend(state: { offers: OfferView[]; preview?: AcceptPreview; proposals?: object[] }): Override {
  return (path, init) => {
    const post = init?.method === 'POST'
    if (!post && /\/offers$/.test(path)) return { status: 200, body: { items: state.offers } }
    if (!post && path.includes('/bundle-proposals')) return { status: 200, body: { items: state.proposals ?? [] } }
    if (post && path.endsWith('/preview')) return { status: 200, body: state.preview }
    if (post && path.endsWith('/accept')) {
      return { status: 201, body: { match: { kind: state.preview?.kind, termsHash: null }, offer: offer({ status: 'accepted' }), result: state.preview?.kind === 'payment' ? { kind: 'payment', ...state.preview.payment } : { kind: 'bundle', proposal: { termsHash: state.preview?.bundle?.termsHash, status: 'proposed', epoch: 42, terms, participants: [BUDI, OWNER, PENCARI], missing: [BUDI, PENCARI], listingHash: listingHashA } } } }
    }
    if (post && /\/offers$/.test(path)) return { status: 201, body: offer() }
    return undefined
  }
}

const neg = () => within(screen.getByRole('region', { name: 'Negosiasi' }))

async function open(account: string | null, state: Parameters<typeof backend>[0], calls: Calls, extra?: Override, row = 0) {
  const wallet = account ? createMockWallet(account, account) : createMockWallet()
  const override: Override = (p, i) => {
    if (i?.method === 'POST') calls.push({ path: p, body: JSON.parse(String(i.body)) })
    return extra?.(p, i) ?? backend(state)(p, i)
  }
  const view = renderApp('/marketplace', override, false, wallet)
  const user = userEvent.setup()
  await screen.findByText(listings[row].offer.assetType + ' · kelas ' + listings[row].offer.assetClass + ' · ' + new Intl.NumberFormat('id-ID').format(listings[row].offer.quantity) + ' unit · ' + (row === 0 ? '100' : '250') + ' credit')
  if (account) await waitFor(() => expect(screen.getAllByRole('button', { name: /Buka/ })[row]).toBeEnabled())
  await user.click(screen.getAllByRole('button', { name: /^Buka/ })[row])
  return { ...view, user, wallet }
}

describe('negosiasi dan barter cepat (FE-020)', () => {
  it('TC-FE-020-01 lawan mengajukan penawaran ronde 1 bertanda tangan voucher', async () => {
    const calls: Calls = []
    const { user } = await open(BUDI, { offers: [] }, calls)
    const form = await screen.findByRole('form', { name: 'Ajukan penawaran' })
    await user.type(within(form).getByLabelText('Nilai usulan (credit)'), '100')
    await user.type(within(form).getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(form).getByRole('button', { name: /Tanda tangani dan kirim penawaran/ }))
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/offers'))).toBe(true))
    const { offer: posted, signature, inReplyTo } = calls.find((c) => c.path.endsWith('/offers'))!.body
    expect(posted).toMatchObject({ circle: 'x207-circle.testnet', listing_hash: listingHashA, proposer: BUDI, round: 1, mode: 'barter', value: C(100), quantity: 5000 })
    expect(inReplyTo).toBeUndefined()
    expect(signature).toBe(await signOffer(posted as Offer, KEY))
    expect(JSON.stringify(calls)).not.toContain(KEY)
  })

  it('TC-FE-020-02 listing tanpa accept_payment: pilihan bayar nonaktif', async () => {
    await open(BUDI, { offers: [] }, [], undefined, 1)
    const form = await screen.findByRole('form', { name: 'Ajukan penawaran' })
    expect(within(form).getByRole('option', { name: /Bayar harga diskon/ })).toBeDisabled()
    expect(within(form).getByRole('option', { name: /Barter/ })).toBeEnabled()
  })

  it('TC-FE-020-03 pemasang melihat angka akhir barter 100/10/3 sebelum menandatangani', async () => {
    const calls: Calls = []
    const state = { offers: [offer()], preview: await previewBundle() }
    const { user } = await open(OWNER, state, calls)
    await screen.findByText(/menunggu jawaban Anda/)
    await user.click(neg().getByRole('button', { name: 'Terima' }))
    await user.type(neg().getByLabelText(/Pencari otonom \(opsional\)/), PENCARI)
    await user.clear(neg().getByLabelText(/Jatah pencari \(%/))
    await user.type(neg().getByLabelText(/Jatah pencari \(%/), '3')
    await user.click(neg().getByRole('button', { name: 'Hitung rincian' }))
    const breakdown = await screen.findByLabelText('Rincian barter')
    expect(breakdown).toHaveTextContent('cashback 7 credit')
    expect(breakdown).toHaveTextContent('Penjual menanggung10 credit')
    expect(breakdown).toHaveTextContent('Jatah pencari3 credit')
    const legs = screen.getByLabelText('Leg bundle')
    expect(within(legs).getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'summarizer → translator: 100 credit', 'translator → scraper: 3 credit', 'translator → summarizer: 107 credit',
    ])
    expect(calls.find((c) => c.path.endsWith('/preview'))!.body).toEqual({ account: OWNER, searcher: PENCARI, searcherShareBps: 300 })
    // belum ada yang disetujui sebelum tombol tanda tangan
    expect(calls.some((c) => c.path.endsWith('/accept'))).toBe(false)
  })

  it('TC-FE-020-04 terima barter: pesan bundle ditandatangani di browser dan dikirim bersama epoch', async () => {
    const calls: Calls = []
    const preview = await previewBundle()
    const { user } = await open(OWNER, { offers: [offer()], preview }, calls)
    await user.click(await neg().findByRole('button', { name: 'Terima' }))
    await user.click(neg().getByRole('button', { name: 'Hitung rincian' }))
    await screen.findByLabelText('Rincian barter')
    await user.type(neg().getByLabelText(/Kunci voucher/), KEY)
    await user.click(neg().getByRole('button', { name: 'Tanda tangani dan terima' }))
    expect(await screen.findByText(/Usulan bundle dibuat untuk epoch 42/)).toHaveTextContent('summarizer, scraper')
    const accept = calls.find((c) => c.path.endsWith('/accept'))!
    expect(accept.body.epoch).toBe(42)
    expect(accept.body.signature).toBe(await signMessageWithVoucher(message, CIRCLE_ACCOUNT, KEY))
    expect(JSON.stringify(accept.body)).not.toContain(KEY)
  })

  it('TC-FE-020-05 pesan tidak cocok dengan terms_hash: tidak menandatangani dan tidak mengirim', async () => {
    const calls: Calls = []
    const preview = await previewBundle()
    preview.bundle!.termsHash = 'f'.repeat(64)
    const { user } = await open(OWNER, { offers: [offer()], preview }, calls)
    await user.click(await neg().findByRole('button', { name: 'Terima' }))
    await user.click(neg().getByRole('button', { name: 'Hitung rincian' }))
    await screen.findByLabelText('Rincian barter')
    await user.type(neg().getByLabelText(/Kunci voucher/), KEY)
    await user.click(neg().getByRole('button', { name: 'Tanda tangani dan terima' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('tidak cocok dengan terms_hash')
    expect(calls.some((c) => c.path.endsWith('/accept'))).toBe(false)
  })

  it('TC-FE-020-06 jalur bayar tanpa pencari: satu pembayaran, tanpa kunci dan tanpa tanda tangan', async () => {
    const calls: Calls = []
    const preview: AcceptPreview = {
      kind: 'payment', epoch: 42, mode: 'pay', discountValue: C(10), searcherValue: '0', searcher: null,
      breakdown: { mode: 'pay', counterpartyPays: C(90), sellerReceives: C(90), searcher: '0', discount: C(10) },
      bundle: null, payment: { payer: BUDI, payee: OWNER, amount: C(90) },
    }
    const { user } = await open(OWNER, { offers: [offer({ mode: 'pay' })], preview }, calls)
    await user.click(await neg().findByRole('button', { name: 'Terima' }))
    await user.click(neg().getByRole('button', { name: 'Hitung rincian' }))
    expect(await screen.findByLabelText('Rincian bayar')).toHaveTextContent('Lawan membayar90 credit')
    await user.click(within(screen.getByRole('region', { name: 'Terima penawaran' })).getByRole('button', { name: /^Terima$/ }))
    expect(await screen.findByText(/membayar 90 credit ke translator dengan voucher biasa; tanpa bundle/)).toBeInTheDocument()
    expect(calls.find((c) => c.path.endsWith('/accept'))!.body.signature).toBeUndefined()
  })

  it('TC-FE-020-07 penawaran balik ronde 2 membalas penawaran terakhir', async () => {
    const calls: Calls = []
    const { user } = await open(OWNER, { offers: [offer()] }, calls)
    await user.click(await neg().findByRole('button', { name: 'Penawaran balik' }))
    const form = screen.getByRole('form', { name: 'Penawaran balik ronde 2' })
    await user.type(within(form).getByLabelText('Nilai usulan (credit)'), '98')
    await user.type(within(form).getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(form).getByRole('button', { name: /Tanda tangani dan kirim penawaran/ }))
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/offers'))).toBe(true))
    const posted = calls.find((c) => c.path.endsWith('/offers'))!.body
    expect(posted.offer).toMatchObject({ proposer: OWNER, round: 2, value: C(98) })
    expect(posted.inReplyTo).toBe('e'.repeat(64))
  })

  it('TC-FE-020-08 tabel ronde, status menunggu lawan, dan tanpa login', async () => {
    const view = await open(null, { offers: [offer(), offer({ offerHash: 'd'.repeat(64), proposer: OWNER, round: 2, awaiting: BUDI, value: C(98), status: 'pending' })] }, [])
    expect(await screen.findByText(/Masuk dengan wallet untuk menawar/)).toBeInTheDocument()
    expect(within(await screen.findByRole('table', { name: 'Ronde negosiasi' })).getAllByRole('row')).toHaveLength(1 + 2)
    void view
  })

  it('TC-FE-020-09 server menolak tanda tangan: pesan jelas', async () => {
    const calls: Calls = []
    const { user } = await open(BUDI, { offers: [] }, calls, (p, i) => (i?.method === 'POST' && p.endsWith('/offers') ? apiError(401, 'invalid_signature') : undefined))
    const form = await screen.findByRole('form', { name: 'Ajukan penawaran' })
    await user.type(within(form).getByLabelText('Nilai usulan (credit)'), '100')
    await user.type(within(form).getByLabelText(/Kunci voucher/), KEY)
    await user.click(within(form).getByRole('button', { name: /Tanda tangani dan kirim penawaran/ }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Periksa kunci voucher')
  })

  it('TC-FE-020-10 peserta bundle menandatangani usulan setelah memeriksa terms_hash', async () => {
    const calls: Calls = []
    const termsHash = await sha256Hex(message)
    const proposal = { termsHash, status: 'proposed', epoch: 42, terms, participants: [BUDI, OWNER, PENCARI], missing: [BUDI, PENCARI], listingHash: listingHashA }
    const { user } = await open(BUDI, { offers: [offer({ status: 'accepted' })], proposals: [proposal] }, calls, (p, i) => (i?.method === 'POST' && p.includes('/signatures') ? { status: 201, body: { ...proposal, missing: [PENCARI] } } : undefined))
    await screen.findByLabelText('Usulan bundle')
    await user.type(neg().getByLabelText(/Kunci voucher/), KEY)
    await user.click(neg().getByRole('button', { name: 'Tanda tangani bundle' }))
    await waitFor(() => expect(calls.some((c) => c.path.includes('/signatures'))).toBe(true))
    const sent = calls.find((c) => c.path.includes('/signatures'))!
    expect(sent.path).toContain(termsHash)
    expect(sent.body).toEqual({ account: BUDI, signature: await signMessageWithVoucher(message, CIRCLE_ACCOUNT, KEY) })
  })
})

// Security review of the frontend (finding FE-1): the message and the recipient to sign come from the server, and the server also supplies the hash
// that "checks" the message, so that check proves nothing. The browser must check the message itself before the voucher key signs it.
describe('keamanan: apa yang ditandatangani kunci voucher (FE-1)', () => {
  async function trySign(preview: AcceptPreview, calls: Calls, who = OWNER) {
    const { user } = await open(who, { offers: [offer()], preview }, calls)
    await user.click(await neg().findByRole('button', { name: 'Terima' }))
    await user.click(neg().getByRole('button', { name: 'Hitung rincian' }))
    await screen.findByLabelText('Rincian barter')
    await user.type(neg().getByLabelText(/Kunci voucher/), KEY)
    await user.click(neg().getByRole('button', { name: 'Tanda tangani dan terima' }))
  }
  const withMessage = async (text: string, over: Partial<AcceptPreview['bundle'] & object> = {}): Promise<AcceptPreview> => {
    const base = await previewBundle()
    return { ...base, bundle: { ...base.bundle!, message: text, termsHash: await sha256Hex(text), ...over } }
  }
  const refused = async (calls: Calls, text: RegExp) => {
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(calls.some((c) => c.path.endsWith('/accept'))).toBe(false)
  }

  it('TC-FE-SEC-01 recipient bukan kontrak lingkaran ini: tidak menandatangani', async () => {
    const calls: Calls = []
    await trySign(await withMessage(message, { recipient: 'evil.testnet' }), calls)
    await refused(calls, /kontrak lingkaran/)
  })

  it('TC-FE-SEC-02 syarat bundle untuk lingkaran lain (hash cocok dengan pesannya): tidak menandatangani', async () => {
    const calls: Calls = []
    await trySign(await withMessage(serializeBundleTerms({ ...terms, circle: 'evil.testnet' })), calls)
    await refused(calls, /kontrak lingkaran/)
  })

  it('TC-FE-SEC-03 pesan yang bukan syarat bundle (kunci tambahan atau bentuk lain): tidak menandatangani dan halaman tidak rusak', async () => {
    const calls: Calls = []
    const voucherLike = JSON.stringify({ circle: CIRCLE_ACCOUNT, payer: OWNER, payee: 'evil.testnet', epoch: 42, seq: 1, cumulativeAmount: C(1000), unit: 'credit', resource: 'x' })
    await trySign(await withMessage(voucherLike), calls)
    await refused(calls, /bukan syarat bundle/)
  })

  it('TC-FE-SEC-04 pesan bukan JSON kanonik (spasi, urutan kunci, leg tidak terurut): tidak menandatangani', async () => {
    const calls: Calls = []
    await trySign(await withMessage(JSON.stringify(terms, null, 1)), calls)
    await refused(calls, /bukan syarat bundle|kanonik/)
  })

  it('TC-FE-SEC-05 leg keluar penandatangan melebihi rincian yang ditampilkan: tidak menandatangani', async () => {
    const calls: Calls = []
    const greedy = { ...terms, legs: terms.legs.map((l) => (l.payer === OWNER && l.payee === BUDI ? { ...l, max_amount: C(5000) } : l)) }
    await trySign(await withMessage(serializeBundleTerms(greedy)), calls)
    await refused(calls, /melebihi rincian/)
  })

  it('TC-FE-SEC-06 penandatangan tidak ada di leg mana pun: tidak menandatangani', async () => {
    const calls: Calls = []
    const others = { ...terms, legs: [{ payer: BUDI, payee: PENCARI, max_amount: C(1) }, { payer: PENCARI, payee: BUDI, max_amount: C(1) }] }
    await trySign(await withMessage(serializeBundleTerms(others)), calls)
    await refused(calls, /tidak ikut/)
  })

  it('TC-FE-SEC-07 epoch pesan berbeda dari epoch rincian: tidak menandatangani', async () => {
    const calls: Calls = []
    await trySign(await withMessage(serializeBundleTerms({ ...terms, epoch: 43 })), calls)
    await refused(calls, /epoch/)
  })

  it('TC-FE-SEC-08 usulan bundle dengan lingkaran lain: tombol tanda tangan tidak menandatangani', async () => {
    const calls: Calls = []
    const evil = { ...terms, circle: 'evil.testnet' }
    const proposal = { termsHash: await sha256Hex(serializeBundleTerms(evil)), status: 'proposed', epoch: 42, terms: evil, participants: [BUDI, OWNER, PENCARI], missing: [BUDI], listingHash: listingHashA }
    const { user } = await open(BUDI, { offers: [offer({ status: 'accepted' })], proposals: [proposal] }, calls)
    await screen.findByLabelText('Usulan bundle')
    await user.type(neg().getByLabelText(/Kunci voucher/), KEY)
    await user.click(neg().getByRole('button', { name: 'Tanda tangani bundle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/kontrak lingkaran/)
    expect(calls.some((c) => c.path.includes('/signatures'))).toBe(false)
  })
})
