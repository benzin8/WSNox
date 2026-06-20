import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Cookies from 'js-cookie'

import { EnergyProvider, EnergyOrb } from './features/energy';
import { isAddingAccount, syncActiveFromStore } from './features/accounts/accountStore';
import { installRefreshInterceptor } from './features/accounts/refreshInterceptor';

installRefreshInterceptor();

import LandingPage from './pages/LandingPage';
import SendCodePage from './pages/auth/SendCodePage';
import VerifyCodePage from './pages/auth/VerifyCodePage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import ChatPage from './pages/chat/ChatPage';
import JoinChannelPage from './pages/chat/JoinChannelPage';
import DashboardPage from './pages/DashboardPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminRoute from './components/AdminRoute';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    return <Navigate to="/auth/send-code" replace />;
  }
  return children;
};

const PublicOnlyRoute = ({ children }) => {
  const token = localStorage.getItem('access_token');
  // While adding another account, allow the auth pages even though a token
  // for the current account already exists.
  if (token && !isAddingAccount()) {
    return <Navigate to="/chat" replace />;
  }
  return children;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'));

  useEffect(() => {
    syncActiveFromStore();
    const checkAuth = () => {
      setIsAuthenticated(!!localStorage.getItem('access_token'));
    };

    window.addEventListener('storage', checkAuth);
    window.addEventListener('focus', checkAuth);

    return () => {
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('focus', checkAuth);
    };
  }, []);

  return (
    <Router>
      <EnergyProvider>
      <div className="min-h-dvh bg-zinc-950 text-zinc-100 selection:bg-lime-400 selection:text-zinc-900">
        <EnergyOrb />
        <Routes>
          {/* Auth Routes — redirect to /chat if already logged in */}
          <Route path="/auth/send-code" element={<PublicOnlyRoute><SendCodePage /></PublicOnlyRoute>} />
          <Route path="/auth/verify" element={<PublicOnlyRoute><VerifyCodePage /></PublicOnlyRoute>} />
          <Route path="/auth/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
          <Route path="/auth/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

          {/* Protected Chat Route */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />

          {/* Channel invite link — stashes the token then routes on */}
          <Route path="/join/:token" element={<JoinChannelPage />} />

          {/* Admin-only Dashboard */}
          <Route
            path="/dashboard"
            element={
              <AdminRoute>
                <DashboardPage />
              </AdminRoute>
            }
          />
          <Route
            path="/dashboard/users"
            element={
              <AdminRoute need="manage_users">
                <AdminUsersPage />
              </AdminRoute>
            }
          />

          {/* Root — landing or chat */}
          <Route
            path="/"
            element={isAuthenticated ? <Navigate to="/chat" replace /> : <LandingPage />}
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      </EnergyProvider>
    </Router>
  );
}

export default App;