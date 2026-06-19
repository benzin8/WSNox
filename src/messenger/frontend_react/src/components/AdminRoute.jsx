import { Navigate } from 'react-router-dom';
import { useIsAdmin } from '../hooks/useIsAdmin';

/**
 * Гейт по RBAC-праву. `need` — требуемое permission (по умолчанию доступ к
 * дашборду). Бэкенд всё равно проверяет права — это лишь UX-редирект.
 */
export default function AdminRoute({ children, need = 'view_dashboard' }) {
  const token = localStorage.getItem('access_token');
  const { permissions, loading } = useIsAdmin();

  if (!token) return <Navigate to="/auth/send-code" replace />;
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!permissions.includes(need)) return <Navigate to="/chat" replace />;
  return children;
}
