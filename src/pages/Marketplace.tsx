// FE-019: barter marketplace (F9). Browse listings, create voucher-signed listings, see asset class, discount, expiry.
// The negotiation panel (FE-020) is in components/Negotiation.tsx and opens from the listing row.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { useListings, useMarketStats } from '../api/queries'
import type { ListingView } from '../api/types'
import { AssetTemplateForm, type TemplateCheck } from '../components/AssetTemplateForm'
import { ResourceListingForm } from '../components/ResourceListingForm'
import { Negotiation } from '../components/Negotiation'
import { OwnIntents } from '../components/OwnIntents'
import { ErrorNotice, Loading, QueryState } from '../components/QueryState'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { ASSET_CLASSES, listingHash, signListing, type AssetClass, type Listing } from '../lib/barter'
import { fromAtomic, toAtomic } from '../lib/amount'
import { describeMarketError } from '../lib/marketError'
import { isHumanListing, withHumanMark } from '../lib/orderFlow'
import { formatCredit, formatNumber, formatTime, shortAccount } from '../lib/format'
import { useWallet } from '../wallet/WalletContext'

const STATUS_OPTIONS = [
  ['open', 'Open'],
  ['matched', 'Matched'],
  ['cancelled', 'Cancelled'],
  ['expired', 'Expired'],
  ['all', 'All'],
] as const
const CLASS_LABEL: Record<AssetClass, string> = {
  A: 'A · native transfer (escrow)',
  B: 'B · account access rent',
  C: 'C · TEE broker (x402)',
  D: 'D · direct service (voucher)',
}
const ASSET_TYPE = /^[a-z0-9][a-z0-9._:-]{0,63}$/
const SECONDS_PER_HOUR = 3600

const bps = (percent: string): number | null => {
  if (!/^\d+([.,]\d{1,2})?$/.test(percent.trim())) return null
  const value = Math.round(Number(percent.replace(',', '.')) * 100)
  return value >= 0 && value <= 10_000 ? value : null
}

function SideFields({ legend, value, onChange }: { legend: string; value: Side; onChange: (next: Side) => void }) {
  return (
    <fieldset className="side">
      <legend>{legend}</legend>
      <label>
        <span>Asset type ({legend})</span>
        <input value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value })} placeholder="gpu-hours" />
      </label>
      <label>
        <span>Class ({legend})</span>
        <select value={value.cls} onChange={(e) => onChange({ ...value, cls: e.target.value as AssetClass })}>
          {ASSET_CLASSES.map((c) => (
            <option key={c} value={c}>{CLASS_LABEL[c]}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Quantity ({legend})</span>
        <input value={value.quantity} onChange={(e) => onChange({ ...value, quantity: e.target.value })} inputMode="numeric" />
      </label>
      <label>
        <span>Credit value ({legend})</span>
        <input value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} inputMode="decimal" />
      </label>
    </fieldset>
  )
}

type Side = { type: string; cls: AssetClass; quantity: string; value: string }
const emptySide = (): Side => ({ type: '', cls: 'D', quantity: '1', value: '' })

function CreateListing({ voucherKey, onVoucherKey }: { voucherKey: string; onVoucherKey: (v: string) => void }) {
  const { account } = useWallet()
  const client = useQueryClient()
  const [offer, setOffer] = useState<Side>(emptySide)
  const [want, setWant] = useState<Side>(emptySide)
  const [terms, setTerms] = useState('')
  const [detail, setDetail] = useState('')
  const [hours, setHours] = useState('24')
  const [discount, setDiscount] = useState('0')
  const [acceptPayment, setAcceptPayment] = useState(true)
  const [discoverable, setDiscoverable] = useState(true)
  const [human, setHuman] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const sideOk = (s: Side) => ASSET_TYPE.test(s.type) && /^[1-9]\d*$/.test(s.quantity) && toAtomic(s.value) !== null
  const discountBps = bps(discount)
  const hoursOk = /^[1-9]\d{0,3}$/.test(hours)
  const valid = Boolean(account) && sideOk(offer) && sideOk(want) && discountBps !== null && hoursOk && voucherKey.trim() !== ''

  // FE-026 (X4): the dry run (BE-052) of the listing, signed like the real one. The owner calls offer_grant and the deposit only after it passes: a listing the backend
  // refuses (type not registered, RWA token not on the circle list, the USDT of the circle) must not be found out after the asset is in escrow.
  // a pass belongs to the form it was made for: any change to the form makes it idle again
  const draftKey = JSON.stringify([offer, want, terms, detail, human, hours, discount, acceptPayment, discoverable, voucherKey, account])
  const [checked, setChecked] = useState<{ draftKey: string; result: TemplateCheck }>({ draftKey: '', result: { state: 'idle' } })
  const check: TemplateCheck = checked.draftKey === draftKey ? checked.result : { state: 'idle' }
  const setCheck = (result: TemplateCheck) => setChecked({ draftKey, result })

  const buildListing = (): Listing => ({
    circle: CONTRACT_ID,
    account: account!,
    offer: { asset_type: offer.type, asset_class: offer.cls, quantity: Number(offer.quantity), value: toAtomic(offer.value)! },
    want: { asset_type: want.type, asset_class: want.cls, quantity: Number(want.quantity), value: toAtomic(want.value)! },
    terms,
    detail: withHumanMark(detail, human),
    expires_at: Math.floor(Date.now() / 1000) + Number(hours) * SECONDS_PER_HOUR,
    discount_bps: discountBps!,
    accept_payment: acceptPayment,
    discoverable,
    nonce: crypto.randomUUID().replaceAll('-', '').slice(0, 24),
  })

  async function runCheck() {
    if (!account || discountBps === null) return
    setCheck({ state: 'busy' })
    try {
      const listing = buildListing()
      const result = await api.checkListing(listing, await signListing(listing, voucherKey))
      setCheck({ state: 'ok', hash: result.listingHash })
    } catch (e) {
      setCheck({ state: 'error', message: describeMarketError(e) })
    }
  }

  async function submit() {
    if (!account || discountBps === null) return
    setBusy(true)
    setError(null)
    setCreated(null)
    try {
      const listing = buildListing()
      const signature = await signListing(listing, voucherKey)
      const view = await api.createListing(listing, signature)
      setCreated(view.listingHash ?? (await listingHash(listing)))
      await client.invalidateQueries({ queryKey: ['listings'] })
      await client.invalidateQueries({ queryKey: ['market-stats'] })
    } catch (e) {
      setError(describeMarketError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="form listing-form"
      aria-label="Create listing"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {!account && <p className="state">Sign in with a wallet to create a listing.</p>}
      <AssetTemplateForm
        onApply={(t) => {
          setOffer({ type: t.side.asset_type, cls: t.side.asset_class, quantity: String(t.side.quantity), value: fromAtomic(t.side.value) })
          setDetail(t.detail)
        }}
        check={check}
        onCheck={() => void runCheck()}
        canCheck={Boolean(account) && sideOk(offer) && sideOk(want) && discountBps !== null && hoursOk && voucherKey.trim() !== ''}
      />
      <ResourceListingForm
        onApply={(t) => {
          setOffer({ type: t.assetType, cls: t.assetClass, quantity: '1', value: fromAtomic(t.unitPriceAtomic) })
          setDetail(t.detail)
        }}
      />
      <SideFields legend="Offering" value={offer} onChange={setOffer} />
      <SideFields legend="Seeking" value={want} onChange={setWant} />
      <label>
        <span>Terms</span>
        <input value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={512} placeholder="delivery within 7 days" />
      </label>
      <label>
        <span>Detail</span>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={2048} rows={3} />
      </label>
      <label>
        <span>Valid for (hours)</span>
        <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" />
        {!hoursOk && <small className="state-error" role="alert">Enter hours 1–9999.</small>}
      </label>
      <label>
        <span>Quick barter discount (%)</span>
        <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
        {discountBps === null && <small className="state-error" role="alert">Discount 0–100% with at most 2 decimals.</small>}
      </label>
      <label className="check">
        <input type="checkbox" checked={acceptPayment} onChange={(e) => setAcceptPayment(e.target.checked)} />
        <span>The counterparty may pay the discounted price</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={human} onChange={(e) => setHuman(e.target.checked)} />
        <span>Done by a human (a “human” mark on the listing; humans take part as ordinary members through the web wallet)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={discoverable} onChange={(e) => setDiscoverable(e.target.checked)} />
        <span>Autonomous seekers may approach this agent</span>
      </label>
      <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
      <div>
        <button type="submit" disabled={!valid || busy}>
          {busy ? 'Signing…' : 'Sign and post listing'}
        </button>
      </div>
      {error && <p className="state state-error" role="alert">{error}</p>}
      {created && <p className="state" role="status">Listing posted: <code>{created}</code></p>}
    </form>
  )
}

function ListingRow({ listing, selected, onSelect }: { listing: ListingView; selected: boolean; onSelect: () => void }) {
  const side = (s: ListingView['offer']) => `${s.assetType} · class ${s.assetClass} · ${formatNumber(s.quantity, 0)} units · ${formatCredit(s.value)} credit`
  return (
    <tr aria-selected={selected}>
      <td><code>{shortAccount(listing.account)}</code>{isHumanListing(listing.detail) && <> <span className="badge" data-testid="human-badge">human</span></>}</td>
      <td>{side(listing.offer)}</td>
      <td>{side(listing.want)}</td>
      <td>{formatNumber(listing.discountBps / 100)}%{listing.acceptPayment ? ', payment allowed' : ''}</td>
      <td>{formatTime(listing.expiresAt)}</td>
      <td>{listing.status}</td>
      <td>
        <button type="button" onClick={onSelect} aria-label={`Open ${listing.listingHash.slice(0, 8)}`}>
          Open
        </button>
      </td>
    </tr>
  )
}

function Stats() {
  const stats = useMarketStats()
  if (stats.data === undefined) return stats.isError ? <ErrorNotice error={stats.error} onRetry={() => stats.refetch()} /> : <Loading label="Loading statistics" />
  const s = stats.data
  return (
    <dl className="status-panel" aria-label="Marketplace statistics">
      <dt>Open listings</dt>
      <dd>{s.listings.open}</dd>
      <dt>Matched</dt>
      <dd>{s.matches.count}</dd>
      <dt>Average time to match</dt>
      <dd>{s.timeToMatchSeconds.average === null ? 'none yet' : `${formatNumber(s.timeToMatchSeconds.average, 0)} seconds`}</dd>
      <dt>Discount value</dt>
      <dd>{formatCredit(s.matches.discountValue)}</dd>
      <dt>Seeker revenue</dt>
      <dd>{formatCredit(s.searcherRevenue.total)}</dd>
    </dl>
  )
}

export function Marketplace() {
  const [status, setStatus] = useState<string>('open')
  const [offerType, setOfferType] = useState('')
  const [voucherKey, setVoucherKey] = useState('')
  const [selected, setSelected] = useState<ListingView | null>(null)
  const query: Record<string, string> = { status, ...(offerType.trim() ? { offerType: offerType.trim() } : {}) }
  const listings = useListings(query)

  return (
    <>
      <Stats />
      <h2>Listing</h2>
      <div className="filters">
        <label>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Offered asset type</span>
          <input value={offerType} onChange={(e) => setOfferType(e.target.value)} placeholder="gpu-hours" />
        </label>
      </div>
      <QueryState query={listings} loadingLabel="Loading listings" isEmpty={(d) => d.items.length === 0} empty="No listing matches the filter yet.">
        {(data) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Poster</th>
                  <th>Offering</th>
                  <th>Seeking</th>
                  <th>Discount</th>
                  <th>Valid until</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <ListingRow key={l.listingHash} listing={l} selected={selected?.listingHash === l.listingHash} onSelect={() => setSelected(l)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
      {selected && <Negotiation listing={selected} voucherKey={voucherKey} onVoucherKey={setVoucherKey} onClose={() => setSelected(null)} />}
      <OwnIntents />
      <h2 id="post-listing">Post a listing</h2>
      <CreateListing voucherKey={voucherKey} onVoucherKey={setVoucherKey} />
    </>
  )
}
