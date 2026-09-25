import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function DashboardRedirect() {
    const { user, loading } = useAuth();

    // Still loading
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-400 mt-3">Loading...</p>
                </div>
            </div>
        );
    }

    if (user && !user.isRegistered) return <Navigate to="/register" replace />;

    const role = user?.role?.toUpperCase();

    // Role-based redirect
    if (role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (role === 'MANAGER') return <Navigate to="/manager/dashboard" replace />;
    if (role === 'AUDITOR') return <Navigate to="/auditor/dashboard" replace />;
    if (role === 'USER') return <Navigate to="/user/dashboard" replace />;

    // Fallback
    return <Navigate to="/" replace />;
}