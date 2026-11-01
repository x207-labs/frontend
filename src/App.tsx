import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { pages } from './routes'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={pages[0].path} replace />} />
        {pages.map(({ path, Page }) => (
          <Route key={path} path={path} element={<Page />} />
        ))}
      </Route>
    </Routes>
  )
}
