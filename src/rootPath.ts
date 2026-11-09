// FE-044: "/" became the landing page. Links written while "/" was the dashboard carry the circle or the epoch in the query
// (README, the submission form: "/?circle=v014", "/?epoch=8"); those still open the dashboard, at /stats with the query kept.
const DASHBOARD_PARAMS = ['circle', 'epoch'] as const

export function rootOpensDashboard(search: string): boolean {
  const params = new URLSearchParams(search)
  return DASHBOARD_PARAMS.some((name) => params.has(name))
}
