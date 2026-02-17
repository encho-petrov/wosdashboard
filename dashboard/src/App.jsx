import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard'; // Staff Dashboard
import PlayerDashboard from './pages/PlayerDashboard'; // NEW Player Dashboard
import Users from './pages/Users';
import Roster from './pages/Roster';
import WarRoom from './pages/WarRoom';

// Smart Home Component
const Home = () => {
  const { user } = useAuth();
  
  // Decide which dashboard to show
  if (user?.role === 'player') {
    return <PlayerDashboard />;
  }
  return <Dashboard />;
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  
  // Optional: Add role check if needed
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />; // Redirect to their home
  }
  
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/war-room" element={<ProtectedRoute><WarRoom /></ProtectedRoute>} />
		<Route 
		  path="/roster" 
		  element={
		    <ProtectedRoute>
		      <Roster />
		    </ProtectedRoute>
		  } 
		/>
          <Route path="/login" element={<Login />} />
          
          {/* Root Path - Redirects based on role */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            } 
          />

          {/* Admin Only Route */}
          <Route 
            path="/users" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Users />
              </ProtectedRoute>
            } 
          />
        </Routes>
        <ToastContainer position="top-right" theme="dark" />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
