import { Navigate } from 'react-router-dom';
import { useIsAdmin } from '../hooks/useIsAdmin';

export default function AdminRoute({ children }) {
  const token = localStorage.getItem('access_token');
  const { isAdmin, loading } = useIsAdmin();

  if (!token) return <Navigate to="/auth/send-code" replace />;
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/chat" replace />;
  return children;
}
