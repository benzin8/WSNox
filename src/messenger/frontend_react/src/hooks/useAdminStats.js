/**
 * useAdminStats — забирает 90-дневный пакет один раз, возвращает текущий период и series.
 * Период меняется на фронте без перезапроса (90д режется до 7/30).
 */
import { useState, useEffect, useMemo } from 'react';

export function useAdminStats(initialDays = 30) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(initialDays);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('access_token');
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { if (!cancelled) setRaw(data); })
      .catch(e => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Срез последних N дней
  const sliced = useMemo(() => {
    if (!raw) return null;
    return {
      regs: raw.regs.slice(-days),
      msgs: raw.msgs.slice(-days),
      dau: raw.dau.slice(-days),
      labels: raw.labels.slice(-days),
      kpis: raw.kpis,
      live: raw.live,
      funnel: raw.funnel,
      problems_by_severity: raw.problems_by_severity,
      geo: raw.geo,
      feed: raw.feed,
      retention: raw.retention,
      details: raw.details,
    };
  }, [raw, days]);

  return { stats: sliced, loading, error, days, setDays };
}
