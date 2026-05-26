import { useReveal } from './useReveal';

const STATS = [
  { k: '<30ms', v: 'Доставка сообщения' },
  { k: '0',     v: 'Трекеров и рекламы' },
  { k: '100%',  v: 'Open source' },
  { k: '∞',     v: 'Сообщений в чате' },
];

export function Stats() {
  const ref = useReveal(0.2);
  return (
    <section className="relative px-6 md:px-10 py-16">
      <div className="max-w-6xl mx-auto">
        <div
          ref={ref}
          className="reveal-scale grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(63,63,70,0.4)',
            border: '1px solid rgba(63,63,70,0.4)',
          }}
        >
          {STATS.map((s) => (
            <div key={s.v} className="p-6 text-center" style={{ background: '#09090b' }}>
              <div
                className="text-4xl font-bold text-lime-400 mb-1"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  letterSpacing: '-0.02em',
                }}
              >
                {s.k}
              </div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
