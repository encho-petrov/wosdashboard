import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlayerDashboard from './pages/PlayerDashboard';
import Users from './pages/Users';
import Roster from './pages/Roster';
import WarRoom from './pages/WarRoom';
import Squads from './pages/Squads';
import Alliances from './pages/Alliances';
import AuditLogs from "./pages/AuditLogs";
import Rotation from './pages/Rotation';
import TransferManager from "./pages/TransferManager.jsx";
import MinistryReservations from "./pages/MinistryReservations.jsx";

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
            <Route path="/ministry" element={<MinistryReservations />} />
          </Routes>
          <ToastContainer position="top-right" theme="dark" />
        </AuthProvider>
      </BrowserRouter>
  );
}

export default App;