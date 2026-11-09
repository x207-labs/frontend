import { rootOpensDashboard } from './rootPath'

// FE-044: "/" is the landing page, every other path is the dashboard. Each loads as its own chunk, so the landing never downloads the wallet and the dashboard never downloads the landing.
// An old dashboard link on "/" (with ?circle= or ?epoch=) moves to /stats with its query before the dashboard boots.
const { pathname, search, hash } = window.location
if (pathname === '/' && !rootOpensDashboard(search)) {
  void import('./landing/mount')
} else {
  if (pathname === '/') window.history.replaceState(null, '', `/stats${search}${hash}`)
  void import('./boot')
}
