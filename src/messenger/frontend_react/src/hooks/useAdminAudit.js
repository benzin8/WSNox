/**
 * useAdminAudit — журнал изменений ролей (GET /api/admin/audit).
 * Грузится по требованию (enabled), чтобы не дёргать API без нужды.
 */
import { useState, useEffect, useCallback } from 'react';

export function useAdminAudit(enabled = true) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const r = await fetch('/api/admin/audit', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEntries(await r.json());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { entries, loading, error, refresh };
}
