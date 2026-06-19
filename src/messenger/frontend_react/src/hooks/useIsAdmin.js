/**
 * useIsAdmin — роль и права текущего юзера через GET /api/admin/me.
 * Кэширует ответ в localStorage с TTL 1 час, чтобы не дёргать API на каждый mount.
 */
import { useState, useEffect } from 'react';

const CACHE_KEY = 'wsnox.admin_me';
const CACHE_TTL_MS = 60 * 60 * 1000;
const EMPTY = { is_admin: false, role: 'user', permissions: [] };

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function clearIsAdminCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem('wsnox.is_admin'); // legacy key
  } catch {
    /* ignore */
  }
}

export function useIsAdmin() {
  const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('access_token');
  const cached = hasToken ? readCache() : EMPTY;
  const [me, setMe] = useState(cached || EMPTY);
  const [loading, setLoading] = useState(hasToken && cached === null);

  useEffect(() => {
    if (!hasToken) return undefined;
    let cancelled = false;
    const token = localStorage.getItem('access_token');
    fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : EMPTY)
      .then(data => {
        if (cancelled) return;
        const norm = {
          is_admin: !!data.is_admin,
          role: data.role || 'user',
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
        };
        setMe(norm);
        writeCache(norm);
      })
      .catch(() => { if (!cancelled) setMe(EMPTY); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hasToken]);

  const perms = me.permissions || [];
  return {
    isAdmin: !!me.is_admin,
    role: me.role || 'user',
    permissions: perms,
    canViewDashboard: perms.includes('view_dashboard'),
    canManageUsers: perms.includes('manage_users'),
    canManageRoles: perms.includes('manage_roles'),
    loading,
  };
}
