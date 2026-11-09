// FE-044: "/" is the landing page, every other path is the dashboard. Each loads as its own chunk, so the landing never downloads the wallet and the dashboard never downloads the landing.
if (window.location.pathname === '/') {
  void import('./landing/mount')
} else {
  void import('./boot')
}
