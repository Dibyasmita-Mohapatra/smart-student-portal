import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";


const ProtectedRoute = () => {
  const {
    isAuthenticated,
    loading,
  } = useAuth();


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
      </div>
    );
  }


  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }


  return <Outlet />;
};


export default ProtectedRoute;