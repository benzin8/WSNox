import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Cookies from 'js-cookie'

import SendCodePage from './pages/auth/SendCodePage';
import VerifyCodePage from './pages/auth/VerifyCodePage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ChatPage from './pages/chat/ChatPage';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    return <Navigate to="/auth/send-code" replace />;
  }
  return children;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'));

  useEffect(() => {
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
      <div className="min-h-screen bg-zinc-900 text-zinc-100 selection:bg-lime-400 selection:text-zinc-900">
        <Routes>
          {/* Auth Routes */}
          <Route path="/auth/send-code" element={<SendCodePage />} />
          <Route path="/auth/verify" element={<VerifyCodePage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />

          {/* Protected Chat Route */}
          <Route 
            path="/chat" 
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            } 
          />

          {/* Root Redirect */}
          <Route 
            path="/" 
            element={isAuthenticated ? <Navigate to="/chat" replace /> : <Navigate to="/auth/send-code" replace />} 
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;