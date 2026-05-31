import BarChart from '../charts/BarChart';

export default function ActivityPanel({ msgs, labels, days }) {
  const max = Math.max(...msgs, 0);
  return (
    <div className="p-6 lg:col-span-2" style={{ background: 'linear-gradient(160deg, rgba(24,24,27,0.7), rgba(24,24,27,0.4))', border: '1px solid rgba(39,39,42,0.85)', borderRadius: 18 }}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase text-zinc-500 mb-1.5" style={{ letterSpacing: '0.16em' }}>Активность</div>
          <h3 className="text-lg font-bold">Сообщений в день</h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ fontFamily: 'ui-monospace,monospace' }}>{max}</div>
          <div className="text-xs text-zinc-500">пик за {days} дней</div>
        </div>
      </div>
      <BarChart data={msgs} labels={labels} />
    </div>
  );
}
