import type { ComponentType } from 'react'
import { ClearingStats } from './pages/ClearingStats'
import { Governance } from './pages/Governance'
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

export type PageRoute = { path: string; title: string; perEpoch: boolean; Page: ComponentType }

export const pages: PageRoute[] = [
  { path: '/onboarding', title: 'Onboarding', perEpoch: false, Page: Onboarding },
  { path: '/grafik', title: 'Grafik kewajiban', perEpoch: true, Page: ObligationGraph },
  { path: '/statistik', title: 'Statistik kliring', perEpoch: true, Page: ClearingStats },
  { path: '/laporan', title: 'Laporan 207', perEpoch: true, Page: Report207 },
  { path: '/settlement', title: 'Settlement', perEpoch: true, Page: Settlement },
  { path: '/risiko', title: 'Risiko', perEpoch: true, Page: Risk },
  { path: '/marketplace', title: 'Marketplace', perEpoch: false, Page: Marketplace },
  { path: '/invoice', title: 'Invoice', perEpoch: false, Page: Invoices },
  { path: '/pesanan', title: 'Pesanan jasa', perEpoch: false, Page: Orders },
  { path: '/lisensi', title: 'Lisensi konten', perEpoch: false, Page: Licenses },
  { path: '/sewa', title: 'Sewa akses', perEpoch: false, Page: Rent },
  { path: '/akses', title: 'Akses (F8)', perEpoch: false, Page: Grants },
  { path: '/tata-kelola', title: 'Tata kelola', perEpoch: false, Page: Governance },
]
