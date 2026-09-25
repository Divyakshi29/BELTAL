import { useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, roleHomePath } from '../context/AuthContext';
import { useToast } from './ui/Toast';

// Sends a signed-in user back to their own portal, saying why.
function DeniedRedirect({ to, message }) {
  const toast = useToast();
  // React StrictMode (dev only) intentionally double-invokes effects to
  // surface non-idempotent ones; without this guard the "Access Denied"
  // toast fires twice for the same redirect.
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.warning(message, 'Access Denied');
  }, [toast, message]);
  return <Navigate to={to} replace />;
}

export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth();

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#060D1A]">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-[#1E5FA8] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 mt-4 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // A wallet with no registered identity only gets the registration flow
  if (!user.isRegistered) {
    return <Navigate to="/register" replace />;
  }

  // Check if user role is allowed
  const userRole = user.role?.toUpperCase();
  if (!allowedRoles.includes(userRole)) {
    return (
      <DeniedRedirect
        to={roleHomePath(userRole) ?? '/'}
        message={`That page is not available to the ${userRole} role — you have been returned to your portal.`}
      />
    );
  }

  // This component is used as a route wrapper in App.jsx. Nested routes are
  // rendered through React Router's Outlet rather than a `children` prop.
  return <Outlet />;
}
