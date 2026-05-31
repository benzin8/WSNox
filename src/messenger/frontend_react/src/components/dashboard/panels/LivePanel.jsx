import ComingSoon from '../ComingSoon';

export default function LivePanel({ live }) {
  return (
    <div className="p-6" style={{ background: 'linear-gradient(160deg, rgba(24,24,27,0.7), rgba(24,24,27,0.4))', border: '1px solid rgba(39,39,42,0.85)', borderRadius: 18 }}>
      <div className="text-[11px] uppercase text-zinc-500 mb-1.5" style={{ letterSpacing: '0.16em' }}>Прямо сейчас</div>
      <h3 className="text-lg font-bold mb-5">Live</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-2xl" style={{ background: 'rgba(163,230,53,0.06)', border: '1px solid rgba(163,230,53,0.18)' }}>
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Онлайн юзеров</div>
            <div className="text-3xl font-bold" style={{ fontFamily: 'ui-monospace,monospace' }}>{live.online}</div>
          </div>
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#a3e635' }} />
            <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: '#a3e635' }} />
          </span>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: 'rgba(39,39,42,0.4)', border: '1px solid rgba(63,63,70,0.5)' }}>
          <div className="text-xs text-zinc-500 mb-0.5">Сообщ./мин</div>
          <div className="text-xl font-bold" style={{ fontFamily: 'ui-monospace,monospace' }}>{live.msgs_per_min}</div>
        </div>
        {live.ws_connections === null && (
          <div className="min-h-[140px]">
            <ComingSoon title="WS-соединения и latency" reason="Появится после prometheus-metrics middleware" />
          </div>
        )}
      </div>
    </div>
  );
}
