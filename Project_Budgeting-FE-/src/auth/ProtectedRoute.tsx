import { Navigate, useLocation } from "react-router-dom";
import { useAppSelector } from "../hooks/useAppSelector";
import { useAppDispatch } from "../hooks/useAppDispatch";
import { useEffect, useState } from "react";
import { initializeAuth } from "../auth/authThunk";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const dispatch = useAppDispatch();
  const auth = useAppSelector((state) => state.auth);
  const location = useLocation();

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      // If already authenticated in Redux (e.g. navigating between pages), skip the API call
      if (auth.isAuthenticated && auth.accessToken) {
        setChecking(false);
        return;
      }

      // Always try to restore session from the httpOnly refresh token cookie.
      // This covers page reloads where Redux state is reset but the cookie is still valid.
      try {
        await dispatch(initializeAuth()).unwrap();
      } catch (err) {
        // Refresh failed — cookie expired or not present; user must log in
        console.log("Auth initialization failed, redirecting to login", err);
      }

      setChecking(false);
    }

    checkAuth();
  }, []); // Run once on mount — covers both initial load and page reload

  // Show a loading spinner while we verify the session
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Not authenticated after cookie check → redirect to login, preserving intended destination
  if (!auth.isAuthenticated) {
    const nextPath = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/?next=${nextPath}`} replace />;
  }

  // Role check
  if (allowedRoles && auth.userRole && !allowedRoles.includes(auth.userRole)) {
    return <div>Access Denied</div>;
  }

  // All good → show protected page
  return <>{children}</>;
};

export default ProtectedRoute;
