import type { ComponentType } from 'react'
import { ClearingStats } from './pages/ClearingStats'
import { Governance } from './pages/Governance'
import { ObligationGraph } from './pages/ObligationGraph'
import { Onboarding } from './pages/Onboarding'
import { Report207 } from './pages/Report207'
import { Risk } from './pages/Risk'
import { Settlement } from './pages/Settlement'

export type PageRoute = { path: string; title: string; Page: ComponentType }

export const pages: PageRoute[] = [
  { path: '/onboarding', title: 'Onboarding', Page: Onboarding },
  { path: '/grafik', title: 'Grafik kewajiban', Page: ObligationGraph },
  { path: '/statistik', title: 'Statistik kliring', Page: ClearingStats },
  { path: '/laporan', title: 'Laporan 207', Page: Report207 },
  { path: '/settlement', title: 'Settlement', Page: Settlement },
  { path: '/risiko', title: 'Risiko', Page: Risk },
  { path: '/tata-kelola', title: 'Tata kelola', Page: Governance },
]
