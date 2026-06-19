export default function FunnelPanel({ funnel }) {
  const stages = Array.isArray(funnel) ? funnel : [];
  return (
    <div className="p-6" style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--color-zinc-900) 70%, transparent), color-mix(in oklab, var(--color-zinc-900) 40%, transparent))', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 85%, transparent)', borderRadius: 18 }}>
      <div className="text-[11px] uppercase text-zinc-500 mb-1.5" style={{ letterSpacing: '0.16em' }}>Онбординг</div>
      <h3 className="text-lg font-bold mb-5">Воронка</h3>
      <div className="space-y-4">
        {stages.map((s) => {
          const pct = Math.max(0, Math.min(100, Number(s.pct) || 0));
          return (
            <div key={s.stage}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm text-zinc-300 font-medium">{s.stage}</span>
                <span className="text-sm text-zinc-400" style={{ fontFamily: 'ui-monospace,monospace' }}>
                  <span className="text-zinc-100 font-bold">{Number(s.count).toLocaleString('ru-RU')}</span>
                  <span className="text-zinc-500 ml-2">{pct.toFixed(1)}%</span>
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 60%, transparent)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: 'var(--color-lime-400)', boxShadow: '0 0 10px rgba(var(--accent-rgb),0.45)' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
