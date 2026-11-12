// FE-019: barter marketplace (F9). Browse listings, create voucher-signed listings, see asset class, discount, expiry.
// The negotiation panel (FE-020) is in components/Negotiation.tsx and opens from the listing row.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { useListing, useListings, useMarketStats } from '../api/queries'
import type { ListingView } from '../api/types'
import { AppraisalBadge } from '../components/AppraisalBadge'
import { AssetTemplateForm, type TemplateCheck } from '../components/AssetTemplateForm'
import { CopyButton } from '../components/CopyButton'
import { ResourceListingForm } from '../components/ResourceListingForm'
import { Negotiation } from '../components/Negotiation'
import { OwnIntents } from '../components/OwnIntents'
import { EmptyHint } from '../components/EmptyHint'
import { AgentIcon } from '../components/icons'
import { ErrorNotice, Loading, QueryState } from '../components/QueryState'
import { SignInPrompt } from '../components/SignInPrompt'
import { SortableTable, type Column } from '../components/SortableTable'
import { VoucherKeyField } from '../components/VoucherKeyField'
import { CONTRACT_ID } from '../config'
import { demoVoucherKey } from '../demo/mode'
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
  A: 'Class A: native transfer (escrow)',
  B: 'Class B: account access rent',
  C: 'Class C: TEE broker (x402)',
  D: 'Class D: direct service (voucher)',
}
const STEPS = ['What you give', 'What you want', 'Terms', 'Sign and post'] as const
type View = 'browse' | 'post' | 'mine'
const VIEWS: [View, string][] = [['browse', 'Browse'], ['post', 'Post a listing'], ['mine', 'Mine']]
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
  const [step, setStep] = useState(1)
  // FE-086: a step is ticked only once it was opened; "Terms" has valid defaults, so it was ticked before anyone saw it.
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([1]))
  const go = (next: number) => {
    setStep(next)
    setSeen((s) => new Set(s).add(next))
  }

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

  // FE-072: the form is four short steps instead of one long page. Every field stays in the DOM (the steps only hide panes with CSS),
  // so a value typed in one step is kept when the member moves on, and the last step lists what still needs fixing, with a jump back to it.
  const stepOk = [sideOk(offer), sideOk(want), discountBps !== null && hoursOk, voucherKey.trim() !== '']
  const missing = STEPS.slice(0, 3).flatMap((s, i) => (stepOk[i] ? [] : [{ step: i + 1, label: s }]))
  return (
    <form
      className="form listing-form"
      aria-label="Create listing"
      data-step={step}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {!account && <SignInPrompt action="create a listing" />}
      <ol className="stepper" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" aria-current={step === i + 1 ? 'step' : undefined} data-done={stepOk[i] && seen.has(i + 1) ? 'true' : undefined} onClick={() => go(i + 1)}>
              <span className="stepper-dot" aria-hidden="true">{stepOk[i] && seen.has(i + 1) && step !== i + 1 ? '✓' : i + 1}</span>
              <span className="stepper-label">{s}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="step-pane" data-pane="1">
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
      </div>
      <div className="step-pane" data-pane="2">
      <SideFields legend="Seeking" value={want} onChange={setWant} />
      </div>
      <div className="step-pane" data-pane="3">
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
      <div className="switches">
        <label className="check">
          <input type="checkbox" role="switch" checked={acceptPayment} onChange={(e) => setAcceptPayment(e.target.checked)} />
          <span>Allow paying the discounted price</span>
        </label>
        <label className="check" title="Adds a “human” mark to the listing. Humans take part as ordinary members through the web wallet.">
          <input type="checkbox" role="switch" checked={human} onChange={(e) => setHuman(e.target.checked)} />
          <span>Done by a human</span>
        </label>
        <label className="check">
          <input type="checkbox" role="switch" checked={discoverable} onChange={(e) => setDiscoverable(e.target.checked)} />
          <span>Let seeking agents approach me</span>
        </label>
      </div>
      </div>
      <div className="step-pane" data-pane="4">
        <div className="deal" aria-label="Your listing">
          <div className="deal-side">
            <span className="deal-tag">You give</span>
            <strong>{offer.type || 'Not set'}</strong>
            <span>{offer.quantity || '?'} units, {offer.value || '?'} credit</span>
          </div>
          <span className="deal-arrow" aria-hidden="true">⇄</span>
          <div className="deal-side">
            <span className="deal-tag">You get</span>
            <strong>{want.type || 'Not set'}</strong>
            <span>{want.quantity || '?'} units, {want.value || '?'} credit</span>
          </div>
        </div>
        {missing.length > 0 && (
          <p className="state state-warn">
            Still to fill:{' '}
            {missing.map((m) => (
              <button key={m.step} type="button" className="quiet" onClick={() => go(m.step)}>
                {m.label}
              </button>
            ))}
          </p>
        )}
        <VoucherKeyField value={voucherKey} onChange={onVoucherKey} disabled={!account} />
        <div>
          <button type="submit" disabled={!valid || busy}>
            {busy ? 'Signing…' : 'Sign and post listing'}
          </button>
        </div>
        {error && <p className="state state-error" role="alert">{error}</p>}
        {created && <p className="state" role="status">Listing posted: <code>{created}</code><CopyButton value={created} label="listing hash" /></p>}
      </div>
      <div className="step-nav">
        <button type="button" className="quiet" disabled={step === 1} onClick={() => go(step - 1)}>
          Back
        </button>
        {step < STEPS.length && (
          <button type="button" className="glow" onClick={() => go(step + 1)}>
            Continue
          </button>
        )}
      </div>
    </form>
  )
}

// FE-057: the listing table can be filtered and sorted on what the reader sees.
const LISTING_COLUMNS: Column<ListingView>[] = [
  { key: 'poster', label: 'Poster', sortValue: (l) => l.account },
  { key: 'offering', label: 'Offering', sortValue: (l) => l.offer.assetType },
  { key: 'seeking', label: 'Seeking', sortValue: (l) => l.want.assetType },
  { key: 'discount', label: 'Discount', sortValue: (l) => l.discountBps },
  { key: 'valid', label: 'Valid until', sortValue: (l) => l.expiresAt },
  { key: 'status', label: 'Status', sortValue: (l) => l.status },
  { key: 'open', label: '' },
]
const listingText = (l: ListingView) => `${l.account} ${l.offer.assetType} ${l.want.assetType} ${l.status} ${l.listingHash.slice(0, 8)}`

// FE-076: a listing row reads as a trade: who posts it, the asset given and the asset wanted (each with its class letter in its colour), the discount,
// how long it stays open, and the status as a tinted word. The table stays a table, so sorting, the filter and screen readers keep working.
// v4: the tone is the x207 result code (ok 200, info 202, warn 402, bad 409). An open listing is claimable (202), a matched one is settled (200); a cancelled or expired one is no result code, so its word stands alone.
const STATUS_TONE: Record<string, string | undefined> = { open: 'info', matched: 'ok' }
function AssetSide({ side, role }: { side: ListingView['offer']; role: 'give' | 'want' }) {
  return (
    <div className="asset-side" data-role={role}>
      <span className="class-badge" data-class={side.assetClass} aria-hidden="true">{side.assetClass}</span>
      <div>
        <span className="asset-name">{side.assetType}</span>
        <span className="asset-meta">Class {side.assetClass}, {formatNumber(side.quantity, 0)} units, {formatCredit(side.value)} credit</span>
      </div>
    </div>
  )
}
function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'ended'
  const h = Math.floor(ms / 3_600_000)
  return h >= 48 ? `${Math.floor(h / 24)} days left` : h >= 1 ? `${h} h left` : `${Math.max(1, Math.floor(ms / 60_000))} min left`
}
function ListingRow({ listing, selected, onSelect }: { listing: ListingView; selected: boolean; onSelect: () => void }) {
  return (
    <tr aria-selected={selected} className="listing-row">
      <td>
        <div className="poster">
          <span className="poster-avatar" aria-hidden="true">{AgentIcon({ account: listing.account, size: 16 }) ?? shortAccount(listing.account).charAt(0).toUpperCase()}</span>
          <code>{shortAccount(listing.account)}</code>
          {isHumanListing(listing.detail) && <span className="badge" data-testid="human-badge">human</span>}
        </div>
      </td>
      <td>
        <AssetSide side={listing.offer} role="give" />
        <AppraisalBadge appraisal={listing.appraisal} />
      </td>
      <td><AssetSide side={listing.want} role="want" /></td>
      <td data-label="Discount"><span className="pill">{formatNumber(listing.discountBps / 100)}%{listing.acceptPayment ? ', payment allowed' : ''}</span></td>
      <td data-label="Valid until">{formatTime(listing.expiresAt)}<span className="asset-meta">{timeLeft(listing.expiresAt)}</span></td>
      <td data-label="Status"><span className="pill" data-tone={STATUS_TONE[listing.status]}>{listing.status}</span></td>
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
  const l = s.listings
  const total = Math.max(1, l.total)
  const t = s.timeToMatchSeconds
  const span = t.min !== null && t.max !== null && t.max > t.min ? t.max - t.min : 0
  const at = (v: number | null) => (v === null || span === 0 ? 50 : ((v - (t.min ?? 0)) / span) * 100)
  const discountShare = sharePercent(s.matches.discountValue, s.matches.listingValue)
  const mix = Math.max(1, s.matches.pay + s.matches.barter)
  // FE-076: each figure carries the picture that explains it: where the listings went, how the matches were paid, the spread of match times,
  // and the share of value given up as discount. The dt/dd pairs stay, so the figures still read as a list.
  return (
    <dl className="pulse" aria-label="Marketplace statistics">
      <div className="pulse-card pulse-wide">
        <dt>Open listings</dt>
        <dd>
          <span className="pulse-figure">{l.open}</span> <span className="pulse-unit">of {l.total} posted</span>
          <span className="bar-stack" aria-hidden="true">
            {LISTING_STATES.map(([k, label]) => l[k] > 0 && <span key={k} data-state={k} style={{ flexGrow: l[k] }} title={`${label}: ${l[k]}`} />)}
          </span>
          <span className="legend">
            {LISTING_STATES.map(([k, label]) => (
              <span key={k} data-state={k}>{label} <b>{l[k]}</b> <small>{Math.round((l[k] / total) * 100)}%</small></span>
            ))}
          </span>
        </dd>
      </div>
      <div className="pulse-card">
        <dt>Matched</dt>
        <dd>
          <span className="pulse-figure">{s.matches.count}</span> <span className="pulse-unit">trades</span>
          <span className="split" aria-hidden="true">
            <span data-part="pay" style={{ flexGrow: s.matches.pay || 0.0001 }} />
            <span data-part="barter" style={{ flexGrow: s.matches.barter || 0.0001 }} />
          </span>
          <span className="legend">
            <span data-part="pay">Paid in credit <b>{Math.round((s.matches.pay / mix) * 100)}%</b></span>
            <span data-part="barter">Barter <b>{Math.round((s.matches.barter / mix) * 100)}%</b></span>
          </span>
        </dd>
      </div>
      <div className="pulse-card">
        <dt>Average time to match</dt>
        <dd>
          <span className="pulse-figure">{t.average === null ? 'none yet' : formatNumber(t.average, 0)}</span>{t.average !== null && <span className="pulse-unit"> seconds</span>}
          {t.min !== null && t.max !== null && (
            <>
              <span className="range" aria-hidden="true">
                <span className="range-dot" data-kind="median" style={{ left: `${at(t.median)}%` }} />
                <span className="range-dot" data-kind="average" style={{ left: `${at(t.average)}%` }} />
              </span>
              <span className="range-ends"><span>fastest {formatNumber(t.min, 0)} s</span><span>{t.samples} sampled</span><span>slowest {formatNumber(t.max, 0)} s</span></span>
            </>
          )}
        </dd>
      </div>
      <div className="pulse-card">
        <dt>Discount value</dt>
        <dd>
          <span className="pulse-figure">{formatCredit(s.matches.discountValue)}</span> <span className="pulse-unit">credit</span>
          <span className="ring-row">
            <svg className="ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" pathLength="100" />
              <circle cx="18" cy="18" r="15.5" pathLength="100" strokeDasharray={`${discountShare} 100`} />
            </svg>
            <span><b>{discountShare}%</b> of the {formatCredit(s.matches.listingValue)} credit traded was given as discount</span>
          </span>
        </dd>
      </div>
      <div className="pulse-card">
        <dt>Seeker revenue</dt>
        <dd>
          <span className="pulse-figure">{formatCredit(s.searcherRevenue.total)}</span> <span className="pulse-unit">credit</span>
          <span className="rank">
            {s.searcherRevenue.bySearcher.slice(0, 3).map((r) => (
              <span key={r.account} className="rank-row">
                <code>{shortAccount(r.account)}</code>
                <span className="rank-bar" aria-hidden="true"><span style={{ width: `${sharePercent(r.total, s.searcherRevenue.total)}%` }} /></span>
                <b>{formatCredit(r.total)}</b>
              </span>
            ))}
            {s.searcherRevenue.bySearcher.length === 0 && <span className="asset-meta">No searcher has earned yet.</span>}
          </span>
        </dd>
      </div>
    </dl>
  )
}
const LISTING_STATES = [
  ['open', 'Open'],
  ['matched', 'Matched'],
  ['cancelled', 'Cancelled'],
  ['expired', 'Expired'],
] as const
/** a as a whole percent of b; both are integer strings in the smallest unit */
function sharePercent(a: string, b: string): number {
  try {
    const d = BigInt(b)
    return d <= 0n ? 0 : Math.max(0, Math.min(100, Number((BigInt(a) * 100n) / d)))
  } catch {
    return 0
  }
}

export function Marketplace() {
  const [status, setStatus] = useState<string>('open')
  const [offerType, setOfferType] = useState('')
  const [voucherKey, setVoucherKey] = useState(demoVoucherKey)
  const [selected, setSelected] = useState<ListingView | null>(null)
  const query: Record<string, string> = { status, ...(offerType.trim() ? { offerType: offerType.trim() } : {}) }
  const listings = useListings(query)
  // FE-100: the negotiation follows the listing as it is now, so after an accept it shows "matched" instead of still waiting for an answer.
  const current = useListing(selected?.listingHash ?? null).data
  const shown = selected && current?.listingHash === selected.listingHash ? current : selected
  // FE-072: one view at a time (browse, post, your own), as a store app does, instead of every part on one long page. The views only hide
  // with CSS, so links and tests still reach every part; #post-listing (from the empty hint) opens the post view.
  const { hash } = useLocation()
  const [view, setView] = useState<View>(hash === '#post-listing' ? 'post' : 'browse')
  const [seenHash, setSeenHash] = useState(hash)
  if (hash !== seenHash) {
    setSeenHash(hash)
    if (hash === '#post-listing') setView('post')
  }

  return (
    <div className="market mk" data-mk="marketplace" data-view={view}>
      <div className="market-top">
        <Stats />
      </div>
      <div className="view-tabs">
        <div className="segmented market-views" role="group" aria-label="Marketplace view">
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <section className="market-pane" data-pane="browse" aria-label="Browse listings">
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
      <QueryState query={listings} loadingLabel="Loading listings" isEmpty={(d) => d.items.length === 0} empty={<><span>No listing matches the filter yet.</span><EmptyHint what="a listing" next={{ href: '#post-listing', label: 'Post the first listing below' }} /></>}>
        {(data) => (
          <SortableTable
            label="Listings"
            filterLabel="Filter the listings shown"
            rows={data.items}
            columns={LISTING_COLUMNS}
            searchText={listingText}
            renderRow={(l) => <ListingRow key={l.listingHash} listing={l} selected={selected?.listingHash === l.listingHash} onSelect={() => setSelected(l)} />}
          />
        )}
      </QueryState>
      {shown && <Negotiation listing={shown} voucherKey={voucherKey} onVoucherKey={setVoucherKey} onClose={() => setSelected(null)} />}
      </section>
      <section className="market-pane" data-pane="mine" aria-label="Your intents">
        <OwnIntents />
      </section>
      <section className="market-pane" data-pane="post" aria-labelledby="post-listing">
        <h2 id="post-listing">Post a listing</h2>
        <CreateListing voucherKey={voucherKey} onVoucherKey={setVoucherKey} />
      </section>
    </div>
  )
}
