import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { BroadcastMonitorPage } from './pages/BroadcastMonitorPage';
import { CustomerPortalPage } from './pages/CustomerPortalPage';
import { EmployeePortalPage } from './pages/EmployeePortalPage';
import { LandingPage } from './pages/LandingPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="/customer" element={<CustomerPortalPage />} />
        <Route path="/employee" element={<EmployeePortalPage />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div />} />
          <Route path="/broadcast-monitor" element={<BroadcastMonitorPage />} />
        </Route>
        {/* Default: redirect unknown routes to landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
