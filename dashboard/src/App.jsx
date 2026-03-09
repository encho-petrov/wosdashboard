import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import RequireAlliance from './components/RequireAlliance.jsx';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PlayerDashboard = lazy(() => import('./pages/PlayerDashboard'));
const Users = lazy(() => import('./pages/Users'));
const Roster = lazy(() => import('./pages/Roster'));
const WarRoom = lazy(() => import('./pages/WarRoom'));
const Squads = lazy(() => import('./pages/Squads'));
const Alliances = lazy(() => import('./pages/Alliances'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Rotation = lazy(() => import('./pages/Rotation'));
const TransferManager = lazy(() => import('./pages/TransferManager'));
const MinistryReservations = lazy(() => import('./pages/MinistryReservations'));
const Profile = lazy(() => import('./pages/Profile'));
const Strategy = lazy(() => import('./pages/StrategyMeta'));
const NotFound = lazy(() => import('./pages/NotFound'));
const EventHistory = lazy(() => import('./pages/EventHistory'));
const Foundry = lazy(() => import('./pages/Foundry'));
const Discord = lazy(() => import('./pages/DiscordConfig'));

const Home = () => {
  const { user } = useAuth();
  if (user?.role === 'player') {
    return <PlayerDashboard />;
  }
  return <Dashboard />;
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />;
  }
  return children;
};

function App() {
  return (
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <Suspense fallback={<div className="h-screen bg-gray-950 flex items-center justify-center text-blue-500 font-black animate-pulse">LOADING MODULE...</div>}>
              <Routes>
                <Route path="/login" element={<Login />} />

                <Route path="/" element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                } />

                <Route path="/roster" element={
                  <ProtectedRoute>
                    <Roster />
                  </ProtectedRoute>
                } />

                <Route path="/war-room" element={
                  <ProtectedRoute>
                    <WarRoom />
                  </ProtectedRoute>
                } />

                <Route path="/squads" element={
                  <ProtectedRoute>
                    <Squads />
                  </ProtectedRoute>
                } />

                <Route path="/transfer-manager" element={
                  <ProtectedRoute>
                    <TransferManager />
                  </ProtectedRoute>
                } />

                <Route path="/users" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Users />
                  </ProtectedRoute>
                } />

                <Route
                    path="/rotation"
                    element={
                      <ProtectedRoute>
                        <Rotation />
                      </ProtectedRoute>
                    }
                />

                <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                />

                <Route path="/alliances" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Alliances />
                  </ProtectedRoute>
                }
                />

                <Route path="/audit-logs" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AuditLogs />
                  </ProtectedRoute>
                }
                />
                <Route path="/ministry" element={
                  <ProtectedRoute>
                    <MinistryReservations />
                  </ProtectedRoute>
                }
                />
                <Route path="/strategy" element={
                  <ProtectedRoute>
                    <Strategy />
                  </ProtectedRoute>
                }
                />
                <Route path="/event-history" element={
                  <ProtectedRoute>
                    <EventHistory />
                  </ProtectedRoute>
                }
                />
                <Route path="/foundry" element={
                  <ProtectedRoute>
                    <RequireAlliance>
                      <Foundry />
                    </RequireAlliance>
                  </ProtectedRoute>
                }
                />
                <Route path="/discord" element={
                  <ProtectedRoute>
                    <RequireAlliance>
                      <Discord />
                    </RequireAlliance>
                  </ProtectedRoute>
                }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppProvider>
          <ToastContainer position="top-right" theme="dark" />
        </AuthProvider>
      </BrowserRouter>
  );
}

export default App;