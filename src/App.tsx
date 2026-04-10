import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { BroadcastMonitorPage } from './pages/BroadcastMonitorPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div />} />
          <Route path="/broadcast-monitor" element={<BroadcastMonitorPage />} />
        </Route>
        {/* Default: redirect everything to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
