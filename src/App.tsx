import { Navigate, Route, Routes } from 'react-router-dom'
import { pages } from './routes'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={pages[0].path} replace />} />
      {pages.map(({ path, Page }) => (
        <Route key={path} path={path} element={<Page />} />
      ))}
    </Routes>
  )
}
