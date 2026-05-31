/**
 * useIsAdmin — лёгкая проверка через GET /api/admin/me.
 * Кэширует ответ в memory + localStorage с TTL 1 час, чтобы не дёргать API на каждый mount.
 */
import { useState, useEffect } from 'react';

const CACHE_KEY = 'wsnox.is_admin';
const CACHE_TTL_MS = 60 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { isAdmin, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return isAdmin;
  } catch {
    return null;
  }
}

function writeCache(isAdmin) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ isAdmin, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function clearIsAdminCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

export function useIsAdmin() {
  // Если токена нет — сразу разрешаем без эффекта (не нарушаем set-state-in-effect)
  const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('access_token');
  const cached = hasToken ? readCache() : false;
  const [isAdmin, setIsAdmin] = useState(cached);
  const [loading, setLoading] = useState(hasToken && cached === null);

  useEffect(() => {
    if (!hasToken) return undefined;
    let cancelled = false;
    const token = localStorage.getItem('access_token');
    fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { is_admin: false })
      .then(data => {
        if (cancelled) return;
        setIsAdmin(!!data.is_admin);
        writeCache(!!data.is_admin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hasToken]);

  return { isAdmin, loading };
}
