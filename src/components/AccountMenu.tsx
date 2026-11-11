import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCachedAccount } from '../account/cache'
import { Button } from '../ds/components'
import { displayAccount, initial } from '../lib/account'
import { useWallet } from '../wallet/WalletContext'
import { NavIcon } from './icons'

// FE-055: the account at the top right. Signed out: one sign-in button. Signed in: the account (short form for long addresses) and a menu with
// copy address and disconnect. v4: the network is named by the chip in the top bar (NetworkChip), signed in or not. The menu opens with the keyboard too: Enter or Space on the account, the arrows between the items, Escape to close and give the focus back.
export function AccountMenu() {
  const { account, busy, error, login, logout } = useWallet()
  const cached = useCachedAccount(account) // FE-068: the display name the person saved in Settings
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(id)
  }, [copied])

  if (!account) {
    // v4: the one glowing button of a signed-out screen. On a phone the words "with wallet" leave the eye but not the accessible name, so the key stays small.
    return (
      <div className="wallet">
        {error && <span className="wallet-error" role="alert">{error}</span>}
        <Button type="button" variant="glow" className="wallet-signin" onClick={login} disabled={busy}>
          <span>{busy ? 'Opening wallet…' : <>Sign in <span className="wallet-signin-more">with wallet</span></>}</span>
        </Button>
      </div>
    )
  }

  const close = (focus: boolean) => {
    setOpen(false)
    if (focus) trigger.current?.focus()
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (at < 0) return
    e.preventDefault()
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(account!)
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <div className="account" ref={root} onKeyDown={onKeyDown}>
      <button type="button" className="account-trigger" ref={trigger} aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${account}`} title={account} onClick={() => setOpen((o) => !o)}>
        {/* FE-087: the photo set in Settings, when there is one */}
        <span className="avatar" aria-hidden="true" data-photo={cached.photo ? 'true' : undefined}>{cached.photo ? <img src={cached.photo} alt="" /> : initial(cached.displayName || account)}</span>
        <span className="wallet-account">{cached.displayName || displayAccount(account)}</span>
      </button>
      {open && (
        <div className="account-menu" role="menu" aria-label="Account" ref={menu}>
          <button type="button" role="menuitem" className="item" onClick={copy}>
            <NavIcon name="copy" size={18} />
            Copy address
          </button>
          <Link to="/settings" role="menuitem" className="item" onClick={() => close(false)}>
            <NavIcon name="/settings" size={18} />
            Settings
          </Link>
          <button type="button" role="menuitem" className="item" onClick={() => { close(false); void logout() }}>
            <NavIcon name="out" size={18} />
            Disconnect
          </button>
        </div>
      )}
      <span className="vh-live" role="status">{copied === 'ok' ? 'Address copied' : copied === 'failed' ? 'Copy failed, select the address by hand' : ''}</span>
    </div>
  )
}
