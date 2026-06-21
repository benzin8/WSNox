/**
 * useIsAdmin — роль и права текущего юзера через GET /api/admin/me.
 * Кэширует ответ в localStorage с TTL 1 час, ПЕР-АККАУНТ (ключ по user_id из
 * токена), чтобы при переключении аккаунтов не подхватывать права другого
 * аккаунта (из-за этого дашборд админа «появлялся» только после пары перезагрузок).
 */
import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const CACHE_PREFIX = 'wsnox.admin_me.';
const CACHE_TTL_MS = 60 * 60 * 1000;
const EMPTY = { is_admin: false, role: 'user', permissions: [] };

function currentUserId() {
  try {
    const t = localStorage.getItem('access_token');
    if (!t) return null;
    const d = jwtDecode(t);
    return d.sub ?? d.user_id ?? null;
  } catch {
    return null;
  }
}

function readCache(uid) {
  if (uid == null) return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + uid);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(uid, data) {
  if (uid == null) return;
  try {
    localStorage.setItem(CACHE_PREFIX + uid, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function clearIsAdminCache() {
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    });
    localStorage.removeItem('wsnox.admin_me'); // legacy global key
    localStorage.removeItem('wsnox.is_admin'); // legacy key
  } catch {
    /* ignore */
  }
}

export function useIsAdmin() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const uid = token ? currentUserId() : null;
  const cached = token ? readCache(uid) : EMPTY;
  const [me, setMe] = useState(cached || EMPTY);
  const [loading, setLoading] = useState(!!token && cached === null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
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
        writeCache(uid, norm);
      })
      .catch(() => { if (!cancelled) setMe(EMPTY); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, uid]);

  const perms = me.permissions || [];
  return {
    isAdmin: !!me.is_admin,
    role: me.role || 'user',
    permissions: perms,
    canViewDashboard: perms.includes('view_dashboard'),
    canManageUsers: perms.includes('manage_users'),
    canManageRoles: perms.includes('manage_roles'),
    canBanUsers: perms.includes('ban_user'),
    canPostAnnouncements: perms.includes('post_announcements'),
    loading,
  };
}
