import {
  ArrowsLeftRight, ArrowUp, Bank, CaretLeft, ChartBar, Clock, Copy, DotsThree, FileText, Gear, Graph, HandCoins, Hash, House, Key, List, LockKey, MagnifyingGlass, Package,
  Plus, Question, Receipt, ShieldWarning, SignOut, SquaresFour, Storefront, User, UserPlus, X, type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { agentGlyph, PROVIDER_GLYPHS } from './glyphs'

// v6 (2026-11-12): the icons are Phosphor (regular weight), one per page and per action, keyed by the route path or the action name.
const ICONS: Record<string, PhosphorIcon> = {
  '/app': House,
  '/stats': ChartBar,
  '/reports': FileText,
  '/charts': Graph,
  '/risk': ShieldWarning,
  '/onboarding': UserPlus,
  '/settlement': HandCoins,
  '/marketplace': Storefront,
  '/invoices': Receipt,
  '/orders': Package,
  '/licenses': Key,
  '/codes': Hash,
  '/transfers': ArrowsLeftRight,
  '/rent': Clock,
  '/access': LockKey,
  '/governance': Bank,
  '/settings': Gear,
  '/help': Question,
  account: User,
  more: DotsThree,
  search: MagnifyingGlass,
  copy: Copy,
  out: SignOut,
  menu: List,
  close: X,
  back: CaretLeft,
  plus: Plus,
  up: ArrowUp,
  grid: SquaresFour,
}

export type IconName = keyof typeof ICONS

/** A member's work as an icon (a chip for gpu, a globe for scraper); null when the account name says nothing about it, so the caller keeps initials. */
export function AgentIcon({ account, size = 14 }: { account: string; size?: number }) {
  const d = agentGlyph(account)
  if (!d) return null
  return (
    <svg className="agent-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  )
}

/** The mark of a service that access is rented on (GitHub, Discord, SSH, S3, AWS). */
export function ProviderIcon({ provider, size = 20 }: { provider: string; size?: number }) {
  const g = PROVIDER_GLYPHS[provider] ?? PROVIDER_GLYPHS.mock
  return (
    <svg className="provider-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...(g.filled ? { fill: 'currentColor' } : { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })}>
      <path d={g.d} />
    </svg>
  )
}

export function NavIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? DotsThree
  return <Icon className="nav-icon" size={size} weight="regular" aria-hidden="true" focusable="false" />
}
