import type { ComponentType } from 'react'
import { ClearingStats } from './pages/ClearingStats'
import { Governance } from './pages/Governance'
import { Marketplace } from './pages/Marketplace'
import { ObligationGraph } from './pages/ObligationGraph'
import { Onboarding } from './pages/Onboarding'
import { Report207 } from './pages/Report207'
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
  { path: '/tata-kelola', title: 'Tata kelola', perEpoch: false, Page: Governance },
]
