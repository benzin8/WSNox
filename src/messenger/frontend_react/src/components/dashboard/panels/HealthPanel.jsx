function StatusRow({ label, ok }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 35%, transparent)', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 50%, transparent)' }}>
      <span className="text-sm text-zinc-300">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[11px]" style={{ color: ok ? 'var(--color-lime-400)' : '#f87171' }}>{ok ? 'OK' : 'DOWN'}</span>
        <span className="inline-flex rounded-full h-2.5 w-2.5" style={{ background: ok ? 'var(--color-lime-400)' : '#f87171', boxShadow: ok ? '0 0 8px rgba(var(--accent-rgb),0.6)' : '0 0 8px rgba(248,113,113,0.6)' }} />
      </span>
    </div>
  );
}

function Total({ label, value }) {
  return (
    <div className="p-3 rounded-xl text-center" style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 35%, transparent)', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 50%, transparent)' }}>
      <div className="text-lg font-bold" style={{ fontFamily: 'ui-monospace,monospace' }}>{Number(value || 0).toLocaleString('ru-RU')}</div>
      <div className="text-[10px] uppercase text-zinc-500 mt-0.5" style={{ letterSpacing: '0.1em' }}>{label}</div>
    </div>
  );
}

export default function HealthPanel({ health }) {
  const h = health || {};
  return (
    <div className="p-6" style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--color-zinc-900) 70%, transparent), color-mix(in oklab, var(--color-zinc-900) 40%, transparent))', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 85%, transparent)', borderRadius: 18 }}>
      <div className="text-[11px] uppercase text-zinc-500 mb-1.5" style={{ letterSpacing: '0.16em' }}>Инфраструктура</div>
      <h3 className="text-lg font-bold mb-5">Здоровье проекта</h3>
      <div className="space-y-2.5 mb-5">
        <StatusRow label="База данных" ok={h.db_ok} />
        <StatusRow label="Redis" ok={h.redis_ok} />
        <StatusRow label="Кэш" ok={h.cache_enabled} />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Total label="Юзеров" value={h.users} />
        <Total label="Сообщений" value={h.messages} />
        <Total label="Чатов" value={h.chats} />
      </div>
      {h.notif_pct != null && (
        <div
          className="mt-2.5 p-3 rounded-xl flex items-center justify-between"
          style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 35%, transparent)', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 50%, transparent)' }}
        >
          <div>
            <div className="text-sm text-zinc-300">Уведомления включены</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {Number(h.notif_users || 0).toLocaleString('ru-RU')} из {Number(h.users || 0).toLocaleString('ru-RU')}
            </div>
          </div>
          <div className="text-2xl font-bold" style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--color-lime-400)' }}>
            {h.notif_pct}%
          </div>
        </div>
      )}
    </div>
  );
}
