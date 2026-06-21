/**
 * useAdminUsers — список юзеров для admin-страницы + setRole мутация.
 */
import { useState, useEffect, useCallback } from 'react';

export function useAdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const r = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setUsers(await r.json());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setRole = useCallback(async (userId, role, confirmEmail) => {
    const token = localStorage.getItem('access_token');
    const r = await fetch(`/api/admin/users/${userId}/admin`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role, confirm_email: confirmEmail }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.detail || `HTTP ${r.status}`);
    }
    const updated = await r.json();
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    return updated;
  }, []);

  const banUser = useCallback(async (userId, banned, confirmEmail, reason) => {
    const token = localStorage.getItem('access_token');
    const r = await fetch(`/api/admin/users/${userId}/ban`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ banned, confirm_email: confirmEmail, reason: reason || null }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.detail || `HTTP ${r.status}`);
    }
    const updated = await r.json();
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    return updated;
  }, []);

  return { users, loading, error, refresh, setRole, banUser };
}
