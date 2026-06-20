const MSG_TYPE_LABELS = {
  text: 'Текст',
  image: 'Изображения',
  video: 'Видео',
  audio: 'Аудио',
  voice: 'Голосовые',
  file: 'Файлы',
  sticker: 'Стикеры',
};

const CHAT_TYPE_LABELS = {
  private: 'Личные',
  group: 'Группы',
  channel: 'Каналы',
};

function Rows({ data, labels }) {
  const entries = Object.entries(data || {});
  const total = entries.reduce((s, [, v]) => s + (Number(v) || 0), 0) || 1;
  if (entries.length === 0) {
    return <div className="text-xs text-zinc-500 italic">нет данных</div>;
  }
  return (
    <div className="space-y-2.5">
      {entries.map(([key, value]) => {
        const pct = ((Number(value) || 0) / total) * 100;
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm text-zinc-300">{labels[key] || key}</span>
              <span className="text-xs text-zinc-400" style={{ fontFamily: 'ui-monospace,monospace' }}>{Number(value).toLocaleString('ru-RU')}</span>
            </div>
            <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 60%, transparent)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--color-lime-400)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GeoPanel({ breakdown }) {
  const b = breakdown || {};
  const mediaPct = Number(b.media_pct) || 0;
  const replyPct = Number(b.reply_pct) || 0;
  return (
    <div className="p-6" style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--color-zinc-900) 70%, transparent), color-mix(in oklab, var(--color-zinc-900) 40%, transparent))', border: '1px solid color-mix(in oklab, var(--color-zinc-800) 85%, transparent)', borderRadius: 18 }}>
      <div className="text-[11px] uppercase text-zinc-500 mb-1.5" style={{ letterSpacing: '0.16em' }}>Структура</div>
      <h3 className="text-lg font-bold mb-5">Разбивка сообщений</h3>

      <div className="text-[11px] uppercase text-zinc-500 mb-2.5" style={{ letterSpacing: '0.12em' }}>Типы сообщений</div>
      <Rows data={b.msg_types} labels={MSG_TYPE_LABELS} />

      <div className="text-[11px] uppercase text-zinc-500 mt-5 mb-2.5" style={{ letterSpacing: '0.12em' }}>Типы чатов</div>
      <Rows data={b.chat_types} labels={CHAT_TYPE_LABELS} />

      <div className="grid grid-cols-2 gap-2.5 mt-5">
        <div className="p-3 rounded-xl text-center" style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.18)' }}>
          <div className="text-lg font-bold" style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--color-lime-400)' }}>{mediaPct.toFixed(1)}%</div>
          <div className="text-[10px] uppercase text-zinc-500 mt-0.5" style={{ letterSpacing: '0.1em' }}>с медиа</div>
        </div>
        <div className="p-3 rounded-xl text-center" style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.18)' }}>
          <div className="text-lg font-bold" style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--color-lime-400)' }}>{replyPct.toFixed(1)}%</div>
          <div className="text-[10px] uppercase text-zinc-500 mt-0.5" style={{ letterSpacing: '0.1em' }}>ответы</div>
        </div>
      </div>
    </div>
  );
}
