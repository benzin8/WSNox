export default function LivePanel({ live }) {
  return (
    <div className="p-6" style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--color-zinc-900) 70%, transparent), color-mix(in oklab, var(--color-zinc-900) 40%, transparent))', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 85%, transparent)', borderRadius: 18 }}>
      <div className="text-[11px] uppercase text-zinc-500 mb-1.5" style={{ letterSpacing: '0.16em' }}>Прямо сейчас</div>
      <h3 className="text-lg font-bold mb-5">Live</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-2xl" style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.18)' }}>
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Онлайн юзеров</div>
            <div className="text-3xl font-bold" style={{ fontFamily: 'ui-monospace,monospace' }}>{live.online}</div>
          </div>
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: 'var(--color-lime-400)' }} />
            <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: 'var(--color-lime-400)' }} />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl" style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 40%, transparent)', border: '1px solid color-mix(in oklab, var(--color-zinc-700) 50%, transparent)' }}>
            <div className="text-xs text-zinc-500 mb-0.5">Сообщ./мин</div>
            <div className="text-xl font-bold" style={{ fontFamily: 'ui-monospace,monospace' }}>{live.msgs_per_min}</div>
          </div>
          <div className="p-4 rounded-2xl" style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 40%, transparent)', border: '1px solid color-mix(in oklab, var(--color-zinc-700) 50%, transparent)' }}>
            <div className="text-xs text-zinc-500 mb-0.5">WS-соединения</div>
            <div className="text-xl font-bold" style={{ fontFamily: 'ui-monospace,monospace' }}>{live.ws_connections ?? '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
