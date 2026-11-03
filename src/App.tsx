import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LEGACY_ROUTES } from './legacyRoutes'
import { pages } from './routes'

// FE-034: the routes are English. The old Indonesian paths still open (a bookmark, a link in an old note) and go to the new one, with the query (the epoch) kept.
function Redirect({ to }: { to: string }) {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: to, search, hash }} replace />
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={pages[0].path} replace />} />
        {pages.map(({ path, Page }) => (
          <Route key={path} path={path} element={<Page />} />
        ))}
        {Object.entries(LEGACY_ROUTES).map(([from, to]) => (
          <Route key={from} path={from} element={<Redirect to={to} />} />
        ))}
      </Route>
    </Routes>
  )
}
