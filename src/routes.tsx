import type { ComponentType } from 'react'
import { ClearingStats } from './pages/ClearingStats'
import { Governance } from './pages/Governance'
import { Codes } from './pages/Codes'
import { Grants } from './pages/Grants'
import { Help } from './pages/Help'
import { Home } from './pages/Home'
import { Invoices } from './pages/Invoices'
import { Licenses } from './pages/Licenses'
import { Marketplace } from './pages/Marketplace'
import { Orders } from './pages/Orders'
import { ObligationGraph } from './pages/ObligationGraph'
import { Onboarding } from './pages/Onboarding'
import { Report207 } from './pages/Report207'
import { Rent } from './pages/Rent'
import { Risk } from './pages/Risk'
import { Settings } from './pages/Settings'
import { Settlement } from './pages/Settlement'
import { Transfers } from './pages/Transfers'

/** The groups of the sidebar, in order. Overview is public; My account needs a wallet; Marketplace pages show their own sign-in card where a form needs one; Help is public. */
export const GROUPS = ['Overview', 'My account', 'Marketplace', 'Governance', 'Help'] as const
export type PageGroup = (typeof GROUPS)[number]

/**
 * FE-069: every page says in one plain sentence what it is for (`intro`, shown under the title), so a first-time visitor never has to guess.
 * The titles are plain words; the old names (207 report, Obligation graph, Access (F8)…) stay as `aka`, so the page search still finds them.
 */
export type PageRoute = { path: string; title: string; intro: string; aka?: string[]; perEpoch: boolean; group: PageGroup; needsWallet?: boolean; Page: ComponentType }

export const pages: PageRoute[] = [
  { path: '/app', title: 'Home', intro: 'Start here: what x207 does, where your account stands, and what to do next.', perEpoch: false, group: 'Overview', Page: Home },
  { path: '/stats', title: 'Clearing results', aka: ['Clearing stats'], intro: 'How one epoch cleared: many vouchers in, a few net payments out.', perEpoch: true, group: 'Overview', Page: ClearingStats },
  { path: '/reports', title: 'Epoch report', aka: ['207 report'], intro: 'The record of one epoch, member by member: what was owed, what cancelled, and what was paid.', perEpoch: true, group: 'Overview', Page: Report207 },
  { path: '/charts', title: 'Who owes whom', aka: ['Obligation graph'], intro: 'A map of the debts between members, before and after the loops cancel.', perEpoch: true, group: 'Overview', Page: ObligationGraph },
  { path: '/risk', title: 'Risk', intro: 'How safe the circle is: stakes, late payments, and who covers a loss.', perEpoch: true, group: 'Overview', Page: Risk },
  { path: '/onboarding', title: 'Join the circle', aka: ['Onboarding'], intro: 'Become a member step by step: test funds, registration, and your credit limit.', perEpoch: false, group: 'My account', needsWallet: true, Page: Onboarding },
  { path: '/settlement', title: 'Pay and claim', aka: ['Settlement'], intro: 'What you owe or can claim after clearing, with the button to pay or claim it.', perEpoch: true, group: 'My account', needsWallet: true, Page: Settlement },
  { path: '/settings', title: 'Settings', intro: 'Your display name, email, and payment reminders.', perEpoch: false, group: 'My account', needsWallet: true, Page: Settings },
  { path: '/marketplace', title: 'Marketplace', intro: 'Offer what you have and find what you need. Trades are paid in credit, and only the net is settled.', perEpoch: false, group: 'Marketplace', Page: Marketplace },
  { path: '/invoices', title: 'Invoices', intro: 'Bill another member for work, in one payment or in instalments.', perEpoch: false, group: 'Marketplace', Page: Invoices },
  { path: '/orders', title: 'Service orders', intro: 'Order a service with milestones and confirm each one when it is delivered.', perEpoch: false, group: 'Marketplace', Page: Orders },
  { path: '/licenses', title: 'Content licenses', intro: 'Sell or buy the right to use a file, such as a dataset or a model. The file stays encrypted until you pay.', perEpoch: false, group: 'Marketplace', Page: Licenses },
  { path: '/codes', title: 'One-time codes', intro: 'Sell or buy single-use codes, such as API credits. The code is revealed only to the buyer.', perEpoch: false, group: 'Marketplace', Page: Codes },
  { path: '/transfers', title: 'Account transfers', aka: ['Platform transfers'], intro: 'Sell a domain, a game item, or a ticket. The payment is held until the platform shows the transfer happened.', perEpoch: false, group: 'Marketplace', Page: Transfers },
  { path: '/rent', title: 'Rent access', aka: ['Access rent'], intro: 'Rent access to an account by the day, and stop whenever you want.', perEpoch: false, group: 'Marketplace', Page: Rent },
  { path: '/access', title: 'Access grants', aka: ['Access (F8)', 'Grants'], intro: 'Which member holds which access right, and until when. Read only.', perEpoch: false, group: 'Marketplace', Page: Grants },
  { path: '/governance', title: 'Governance', intro: 'Changes to the rules of the circle, proposed and voted in the DAO. Read only.', perEpoch: false, group: 'Governance', Page: Governance },
  { path: '/help', title: 'Help', aka: ['Glossary', 'How it works', 'FAQ'], intro: 'How x207 works in four steps, and what each word on these pages means.', perEpoch: false, group: 'Help', Page: Help },
]
