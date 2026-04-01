import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import Markets from '@/pages/Markets'
import Spot from '@/pages/Spot'
import Perps from '@/pages/Perps'
import Portfolio from '@/pages/Portfolio'
import Wallet from '@/pages/Wallet'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/markets" element={<Markets />} />
        <Route path="/spot" element={<Spot />} />
        <Route path="/perps" element={<Perps />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
