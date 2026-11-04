import type { ComponentType } from 'react'
import { ClearingStats } from './pages/ClearingStats'
import { Governance } from './pages/Governance'
import { Codes } from './pages/Codes'
import { Grants } from './pages/Grants'
import { Invoices } from './pages/Invoices'
import { Licenses } from './pages/Licenses'
import { Marketplace } from './pages/Marketplace'
import { Orders } from './pages/Orders'
import { ObligationGraph } from './pages/ObligationGraph'
import { Onboarding } from './pages/Onboarding'
import { Report207 } from './pages/Report207'
import { Rent } from './pages/Rent'
import { Risk } from './pages/Risk'
import { Settlement } from './pages/Settlement'
import { Transfers } from './pages/Transfers'

/** The groups of the sidebar, in order. Overview is public; My account needs a wallet; Marketplace pages show their own sign-in line where a form needs one. */
export const GROUPS = ['Overview', 'My account', 'Marketplace', 'Governance'] as const
export type PageGroup = (typeof GROUPS)[number]

export type PageRoute = { path: string; title: string; perEpoch: boolean; group: PageGroup; needsWallet?: boolean; Page: ComponentType }

export const pages: PageRoute[] = [
  { path: '/stats', title: 'Clearing stats', perEpoch: true, group: 'Overview', Page: ClearingStats },
  { path: '/reports', title: '207 report', perEpoch: true, group: 'Overview', Page: Report207 },
  { path: '/charts', title: 'Obligation graph', perEpoch: true, group: 'Overview', Page: ObligationGraph },
  { path: '/risk', title: 'Risk', perEpoch: true, group: 'Overview', Page: Risk },
  { path: '/onboarding', title: 'Onboarding', perEpoch: false, group: 'My account', needsWallet: true, Page: Onboarding },
  { path: '/settlement', title: 'Settlement', perEpoch: true, group: 'My account', needsWallet: true, Page: Settlement },
  { path: '/marketplace', title: 'Marketplace', perEpoch: false, group: 'Marketplace', Page: Marketplace },
  { path: '/invoices', title: 'Invoices', perEpoch: false, group: 'Marketplace', Page: Invoices },
  { path: '/orders', title: 'Service orders', perEpoch: false, group: 'Marketplace', Page: Orders },
  { path: '/licenses', title: 'Content licenses', perEpoch: false, group: 'Marketplace', Page: Licenses },
  { path: '/codes', title: 'One-time codes', perEpoch: false, group: 'Marketplace', Page: Codes },
  { path: '/transfers', title: 'Platform transfers', perEpoch: false, group: 'Marketplace', Page: Transfers },
  { path: '/rent', title: 'Access rent', perEpoch: false, group: 'Marketplace', Page: Rent },
  { path: '/access', title: 'Access (F8)', perEpoch: false, group: 'Marketplace', Page: Grants },
  { path: '/governance', title: 'Governance', perEpoch: false, group: 'Governance', Page: Governance },
]
