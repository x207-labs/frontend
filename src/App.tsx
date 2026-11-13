import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { FeedbackButton } from './account/FeedbackButton'
import { Layout } from './components/Layout'
import { LEGACY_ROUTES } from './legacyRoutes'
import { RequireWallet } from './components/RequireWallet'
import { TourLauncher } from './tour/TourLauncher'
import { OnboardingLink } from './onboarding/OnboardingLink'
import { Agent, Agents } from './pages/Agent'
import { AGENTS_PATH, pages } from './routes'
import { rootOpensDashboard } from './rootPath'

const Landing = lazy(() => import('./landing/Landing'))
const SignPage = lazy(() => import('./wallet/SignPage')) // FE-059: the popup of the Privy wallet; its login SDK and Radix styles load only here

// FE-034: the routes are English. The old Indonesian paths still open (a bookmark, a link in an old note) and go to the new one, with the query (the epoch) kept.
function Redirect({ to }: { to: string }) {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: to, search, hash }} replace />
}

// FE-044: "/" is the landing page, except an old dashboard link (?circle= or ?epoch=), which goes to /stats with its query.
function Root() {
  const { search } = useLocation()
  if (rootOpensDashboard(search)) return <Redirect to="/stats" />
  return <Suspense fallback={null}><Landing /></Suspense>
}

// A path that no page owns (a mistyped link) used to leave the page blank. FE-069: it offers the way back (Home), help, and the public results.
export function NotFound() {
  const { pathname, search } = useLocation()
  return (
    <section className="connect" aria-label="Page not found">
      <h2>This page does not exist</h2>
      <p>
        Nothing lives at <code>{pathname}</code>. The link may be old or mistyped.
      </p>
      <p className="cta-row">
        <Link className="btn" to={{ pathname: '/app', search }}>Go to Home</Link>
        <Link className="btn quiet" to={{ pathname: '/help', search }}>Get help</Link>
        <Link to={{ pathname: '/stats', search }}>See the clearing results</Link>
      </p>
    </section>
  )
}

export function App() {
  return (
    <>
    <Routes>
      {/* FE-037: outside the layout, so the first paint of "/" is not the layout with "Page not found". FE-044: "/" is the landing page; a full load of "/" gets it from main.tsx without the wallet, this route covers a link inside the dashboard. */}
      <Route path="/" element={<Root />} />
      <Route path="/sign" element={<Suspense fallback={null}><SignPage /></Suspense>} />
      <Route element={<Layout />}>
        {pages.map(({ path, title, needsWallet, Page }) => (
          <Route key={path} path={path} element={needsWallet ? <RequireWallet title={title}><Page /></RequireWallet> : <Page />} />
        ))}
        {/* v6: the agents of the circle, as Grok Bot lists its bots */}
        <Route path={AGENTS_PATH} element={<Agents />} />
        <Route path={`${AGENTS_PATH}/:account`} element={<Agent />} />
        {Object.entries(LEGACY_ROUTES).map(([from, to]) => (
          <Route key={from} path={from} element={<Redirect to={to} />} />
        ))}
        {/* FE-121: /tour opens the guided tour over the dashboard (TourLauncher sends it on to /app) */}
        <Route path="/tour" element={null} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    <TourLauncher /> {/* FE-121: the guided tour, its chunk loaded on first start */}
    <OnboardingLink /> {/* FE-122: ?onboarding=1 replays the onboarding from step 1 */}
    <FeedbackButton /> {/* FE-068: last in the page, so the skip link stays the first stop of the keyboard */}
    </>
  )
}
