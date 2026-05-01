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
      // No token → Force login
      if (!auth.accessToken) {
        setChecking(false);
        return;
      }

      // Token exists but user not loaded → fetch user
      if (!auth.isAuthenticated) {
        try {
          await dispatch(initializeAuth()).unwrap();
        } catch (err) {
          // Refresh failed, token invalid, etc
          console.log("Auth initialization failed", err);
        }
      }

      setChecking(false);
    }

    checkAuth();
  }, [auth.accessToken]);

  // Wait while checking token / refreshing
  if (checking) {
    return <div className="text-center p-4">Loading...</div>;
  }

  // No token and not authenticated → redirect to login
  if (!auth.isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Role check
if (allowedRoles && auth.userRole && !allowedRoles.includes(auth.userRole)) {
  return <div>Access Denied</div>;
}


  // All good → show protected page
  return <>{children}</>;
};

export default ProtectedRoute;
