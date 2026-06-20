function relTime(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'только что';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  const d = Math.floor(hr / 24);
  return `${d} дн назад`;
}

export default function FeedPanel({ feed }) {
  const items = Array.isArray(feed) ? feed : [];
  return (
    <div className="p-6 flex flex-col" style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--color-zinc-900) 70%, transparent), color-mix(in oklab, var(--color-zinc-900) 40%, transparent))', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 85%, transparent)', borderRadius: 18 }}>
      <div className="text-[11px] uppercase text-zinc-500 mb-1.5" style={{ letterSpacing: '0.16em' }}>Лента</div>
      <h3 className="text-lg font-bold mb-5">Новые регистрации</h3>
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-500 italic py-8">
          Пока нет новых регистраций
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 260 }}>
          {items.map((it, i) => (
            <div key={`${it.username}-${it.at}-${i}`} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 35%, transparent)', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 50%, transparent)' }}>
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'rgba(var(--accent-rgb),0.10)', border: '1px solid rgba(var(--accent-rgb),0.20)', color: 'var(--color-lime-400)' }}>
                {(it.name || it.username || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-200 truncate">@{it.username}</div>
                {it.name && <div className="text-[11px] text-zinc-500 truncate">{it.name}</div>}
              </div>
              <div className="text-[11px] text-zinc-500 shrink-0">{relTime(it.at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
