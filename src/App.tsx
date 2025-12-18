
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { HostAuth } from './pages/host/Auth';
import { HostHome } from './pages/host/Home';
import { HostCreate } from './pages/host/Create';
import { HostDashboard } from './pages/host/Dashboard';
import { PlayerJoin } from './pages/player/Join';
import { PlayerGame } from './pages/player/Game';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          
          {/* Host Routes */}
          <Route path="/host/auth" element={<HostAuth />} />
          <Route path="/host" element={<HostHome />} />
          <Route path="/host/create" element={<HostCreate />} />
          <Route path="/host/:code" element={<HostDashboard />} />
          
          {/* Player Routes */}
          <Route path="/join" element={<PlayerJoin />} />
          <Route path="/play/:code" element={<PlayerGame />} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
