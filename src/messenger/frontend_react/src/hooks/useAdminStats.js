/**
 * useAdminStats — забирает 90-дневный пакет один раз, возвращает текущий период и series.
 * Период меняется на фронте без перезапроса (90д режется до 7/30).
 *
 * Live-секция (online, msgs/min) обновляется отдельным polling'ом раз в 10s
 * через лёгкий /api/admin/live endpoint — не перерасчитывает тяжёлые агрегаты.
 */
import { useState, useEffect, useMemo } from 'react';

const LIVE_POLL_MS = 10_000;

export function useAdminStats(initialDays = 30) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(initialDays);
  const [live, setLive] = useState(null);

  // Initial heavy fetch
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('access_token');
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (cancelled) return;
        setRaw(data);
        setLive(data.live);
      })
      .catch(e => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Light polling of live block
  useEffect(() => {
    if (!raw) return undefined;
    let cancelled = false;
    const token = localStorage.getItem('access_token');
    const tick = async () => {
      try {
        const r = await fetch('/api/admin/live', { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (!cancelled) setLive(data);
      } catch { /* silent — keep last value */ }
    };
    const id = setInterval(tick, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [raw]);

  // Срез последних N дней + live из polling'а
  const sliced = useMemo(() => {
    if (!raw) return null;
    return {
      regs: raw.regs.slice(-days),
      msgs: raw.msgs.slice(-days),
      dau: raw.dau.slice(-days),
      labels: raw.labels.slice(-days),
      kpis: raw.kpis,
      live: live || raw.live,
      funnel: raw.funnel,
      problems_by_severity: raw.problems_by_severity,
      geo: raw.geo,
      feed: raw.feed,
      retention: raw.retention,
      breakdown: raw.breakdown,
      health: raw.health,
      details: raw.details,
    };
  }, [raw, days, live]);

  return { stats: sliced, loading, error, days, setDays };
}
