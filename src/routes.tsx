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

export type PageRoute = { path: string; title: string; perEpoch: boolean; Page: ComponentType }

export const pages: PageRoute[] = [
  { path: '/onboarding', title: 'Onboarding', perEpoch: false, Page: Onboarding },
  { path: '/charts', title: 'Obligation graph', perEpoch: true, Page: ObligationGraph },
  { path: '/stats', title: 'Clearing stats', perEpoch: true, Page: ClearingStats },
  { path: '/reports', title: '207 report', perEpoch: true, Page: Report207 },
  { path: '/settlement', title: 'Settlement', perEpoch: true, Page: Settlement },
  { path: '/risk', title: 'Risk', perEpoch: true, Page: Risk },
  { path: '/marketplace', title: 'Marketplace', perEpoch: false, Page: Marketplace },
  { path: '/invoices', title: 'Invoices', perEpoch: false, Page: Invoices },
  { path: '/orders', title: 'Service orders', perEpoch: false, Page: Orders },
  { path: '/licenses', title: 'Content licenses', perEpoch: false, Page: Licenses },
  { path: '/codes', title: 'One-time codes', perEpoch: false, Page: Codes },
  { path: '/transfers', title: 'Platform transfers', perEpoch: false, Page: Transfers },
  { path: '/rent', title: 'Access rent', perEpoch: false, Page: Rent },
  { path: '/access', title: 'Access (F8)', perEpoch: false, Page: Grants },
  { path: '/governance', title: 'Governance', perEpoch: false, Page: Governance },
]
