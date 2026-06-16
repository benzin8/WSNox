import { User, Phone, MoreVertical, Send } from 'lucide-react';

const LIME = 'var(--color-lime-400)';

function MiniBubble({ dir, text, time }) {
  const isOut = dir === 'out';
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div
        className="px-2.5 py-1.5 text-[11px] leading-snug"
        style={{
          maxWidth: '78%',
          background: isOut ? LIME : '#27272a',
          color: isOut ? '#18181b' : '#f4f4f5',
          fontWeight: isOut ? 500 : 400,
          border: isOut ? 'none' : '1px solid rgba(63,63,70,0.6)',
          borderRadius: 12,
          borderBottomRightRadius: isOut ? 3 : 12,
          borderBottomLeftRadius: isOut ? 12 : 3,
        }}
      >
        <span>{text}</span>
        <span
          className="ml-1.5 text-[9px]"
          style={{ color: isOut ? 'rgba(24,24,27,0.6)' : '#71717a' }}
        >
          {time}
        </span>
      </div>
    </div>
  );
}

const SIDEBAR_CHATS = [
  { name: 'Михаил',  msg: 'Хорошо, давай завтра', selected: true,  unread: 2 },
  { name: 'Pixie',   msg: 'Лена: ревью когда?',                    unread: 5 },
  { name: 'Дмитрий', msg: 'Спасибо!' },
  { name: 'Олег',    msg: 'Видел отчёт?' },
  { name: 'Юля',     msg: 'Перезвоню' },
];

export function ChatPreview() {
  return (
    <div
      className="rounded-2xl overflow-hidden flex"
      style={{
        height: 380,
        background: '#09090b',
        border: '1px solid rgba(63,63,70,0.6)',
        boxShadow:
          '0 60px 120px -20px rgba(0,0,0,0.7), 0 0 80px rgba(var(--accent-rgb),0.12)',
      }}
    >
      {/* Mini sidebar */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{ width: 260, background: '#09090b', borderRight: '1px solid rgba(39,39,42,0.8)' }}
      >
        <div className="p-4 flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-900 font-bold text-sm"
            style={{ background: LIME }}
          >
            А
          </div>
          <span className="font-bold text-sm text-zinc-100">Чаты</span>
        </div>
        <div className="px-3 pb-2">
          <div
            className="rounded-lg py-1.5 px-3 text-[11px] text-zinc-500"
            style={{ background: 'rgba(39,39,42,0.3)', border: '1px solid rgba(63,63,70,0.6)' }}
          >
            Поиск...
          </div>
        </div>
        <div className="px-2 space-y-1 flex-grow overflow-hidden">
          {SIDEBAR_CHATS.map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-2 p-2 rounded-xl"
              style={{
                background: c.selected ? 'rgba(var(--accent-rgb),0.10)' : 'transparent',
                border: c.selected ? '1px solid rgba(var(--accent-rgb),0.20)' : '1px solid transparent',
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: c.selected ? LIME : '#27272a',
                  color: c.selected ? '#09090b' : '#a1a1aa',
                  border: c.selected ? 'none' : '1px solid #3f3f46',
                }}
              >
                <User size={14} />
              </div>
              <div className="flex-grow min-w-0">
                <span className="text-[12px] font-bold text-zinc-100 truncate block">{c.name}</span>
                <p className="text-[10px] text-zinc-400 truncate">{c.msg}</p>
              </div>
              {c.unread > 0 && (
                <span
                  className="min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{ background: LIME, color: '#18181b' }}
                >
                  {c.unread}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mini chat panel */}
      <div className="flex-1 flex flex-col min-h-0">
        <header
          className="h-14 flex-shrink-0 flex items-center gap-2.5 px-5"
          style={{ background: 'rgba(9,9,11,0.9)', borderBottom: '1px solid rgba(39,39,42,0.8)' }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: '#27272a', border: '1px solid #3f3f46' }}
          >
            <User size={16} className="text-lime-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100">Михаил Соколов</h3>
            <p className="text-[10px] text-lime-400">в сети</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-zinc-500">
            <Phone size={14} />
            <MoreVertical size={14} />
          </div>
        </header>
        <div className="flex-grow px-5 py-3 space-y-1.5 overflow-hidden">
          <MiniBubble dir="in"  text="Привет! Как там с тестами?" time="14:21" />
          <MiniBubble dir="out" text="Все 47 кейсов прошли. Один флаки, чиню" time="14:23" />
          <MiniBubble dir="in"  text="А релиз сегодня успеваем?" time="14:24" />
          <MiniBubble dir="out" text="Если фикс в течение часа — да 👌" time="14:26" />
        </div>
        <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(39,39,42,0.8)' }}>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-1.5"
            style={{ background: 'rgba(39,39,42,0.3)', border: '1px solid rgba(63,63,70,0.6)' }}
          >
            <span className="text-[12px] text-zinc-500 flex-grow">Type your message...</span>
            <div className="p-1.5 rounded-md" style={{ background: LIME, color: '#18181b' }}>
              <Send size={12} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
