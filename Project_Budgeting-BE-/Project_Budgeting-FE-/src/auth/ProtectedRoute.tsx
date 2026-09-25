import { Navigate } from "react-router-dom";
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

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      // Not authenticated in memory (e.g. after a page refresh) → try to
      // restore the session from the httpOnly refresh_token cookie before
      // giving up and sending the user to login.
      if (!auth.isAuthenticated) {
        try {
          await dispatch(initializeAuth()).unwrap();
        } catch (err) {
          // Refresh failed, cookie missing/expired, etc.
          console.log("Auth initialization failed", err);
        }
      }

      setChecking(false);
    }

    checkAuth();
  }, [auth.isAuthenticated]);

  // Wait while checking token / refreshing
  if (checking) {
    return <div className="text-center p-4">Loading...</div>;
  }

  // No token and not authenticated → redirect to login
  if (!auth.isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Role check (case-insensitive, since role casing isn't guaranteed consistent from the backend)
  if (allowedRoles && auth.userRole) {
    const normalizedRole = auth.userRole.toLowerCase();
    const hasAccess = allowedRoles.some((role) => role.toLowerCase() === normalizedRole);
    if (!hasAccess) {
      return <div>Access Denied</div>;
    }
  }


  // All good → show protected page
  return <>{children}</>;
};

export default ProtectedRoute;
