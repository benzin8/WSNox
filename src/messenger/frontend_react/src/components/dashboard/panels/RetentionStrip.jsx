function RetCard({ label, sub, value }) {
  const v = Number(value) || 0;
  return (
    <div className="p-5" style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--color-zinc-900) 70%, transparent), color-mix(in oklab, var(--color-zinc-900) 40%, transparent))', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 85%, transparent)', borderRadius: 18 }}>
      <div className="text-[11px] uppercase text-zinc-500 mb-2" style={{ letterSpacing: '0.16em' }}>{label}</div>
      <div className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--color-lime-400)' }}>
        {v.toFixed(1)}<span className="text-lg text-zinc-500">%</span>
      </div>
      <div className="text-[11px] text-zinc-500 mt-1">{sub}</div>
      <div className="mt-3 h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 60%, transparent)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: 'rgba(var(--accent-rgb),0.6)' }} />
      </div>
    </div>
  );
}

export default function RetentionStrip({ retention, stickiness }) {
  const r = retention || {};
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <RetCard label="Retention D1" sub="вернулись на 1-й день" value={r.d1} />
      <RetCard label="Retention D7" sub="вернулись на 7-й день" value={r.d7} />
      <RetCard label="Retention D30" sub="вернулись на 30-й день" value={r.d30} />
      <RetCard label="Stickiness" sub="DAU / MAU" value={stickiness} />
    </div>
  );
}
