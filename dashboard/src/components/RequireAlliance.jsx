import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RequireAlliance({ children }) {
    const { user } = useAuth();

    // If the user has no alliance assigned, boot them to the 404 page
    if (!user || !user.allianceId) {
        return <Navigate to="/404" replace />;
    }

    // Otherwise, render the requested component
    return children;
}