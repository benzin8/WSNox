import Sparkline from './charts/Sparkline';
import { fmt, fmtK } from './charts/smoothPath';

/**
 * KPI карточка с дельтой и спарклайном.
 * В MVP клик-детализация недоступна (detailsAvailable=false) — карточка не интерактивна.
 */
export default function KpiCard({
  icon, label, sub, value, big, delta, invert, series, days, onClick,
  detailsAvailable = false,
}) {
  const up = delta >= 0;
  const good = invert ? !up : up;
  const arrow = up ? '▲' : '▼';
  const val = big ? fmtK(value) : fmt(value);
  const interactive = detailsAvailable && typeof onClick === 'function';

  return (
    <div
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`p-5 relative overflow-hidden transition-all ${interactive ? 'hover:-translate-y-0.5 hover:border-lime-400/40' : ''}`}
      style={{
        background: 'linear-gradient(160deg, rgba(24,24,27,0.7), rgba(24,24,27,0.4))',
        border: '1px solid rgba(39,39,42,0.85)',
        borderRadius: 18,
        cursor: interactive ? 'pointer' : 'default',
      }}
    >
      {interactive && (
        <span className="absolute top-3.5 right-3.5 text-lime-400 opacity-0 hover:opacity-100 transition-opacity" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
        </span>
      )}
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(163,230,53,0.08)', border: '1px solid rgba(163,230,53,0.18)', color: '#a3e635' }}
        >
          {icon}
        </div>
        <span
          className="text-[11px] px-2 py-0.5 rounded-md"
          style={{
            color: good ? '#a3e635' : '#f87171',
            background: good ? 'rgba(163,230,53,0.10)' : 'rgba(248,113,113,0.10)',
            border: `1px solid ${good ? 'rgba(163,230,53,0.20)' : 'rgba(248,113,113,0.20)'}`,
            fontFamily: 'ui-monospace,monospace',
          }}
        >
          {arrow} {Math.abs(delta)}%
        </span>
      </div>
      <div className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'ui-monospace,monospace' }}>{val}</div>
      <div className="text-sm text-zinc-300 font-medium mt-0.5">{label}</div>
      <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>
      <div className="mt-3 -mx-1">
        <Sparkline data={series.slice(-days)} />
      </div>
    </div>
  );
}
