import { Zap, Shield, Globe, Lock } from 'lucide-react';
import { Eyebrow } from './Eyebrow';
import { useReveal } from './useReveal';

const FEATURES = [
  { icon: Zap,    title: 'Мгновенно', desc: 'Сообщения доставляются за миллисекунды через WebSocket. Никаких задержек, никаких перезагрузок.', tag: 'WebSocket' },
  { icon: Shield, title: 'Безопасно', desc: 'Шифрование на каждом уровне. Ваши данные принадлежат только вам. Никто другой не имеет к ним доступа.', tag: 'TLS · E2E' },
  { icon: Globe,  title: 'Везде',     desc: 'PWA-приложение работает на любом устройстве — телефон, планшет, десктоп. Без установки.', tag: 'PWA' },
  { icon: Lock,   title: 'Приватно',  desc: 'Никакой рекламы, никакого отслеживания. Только вы и ваши собеседники. Без аналитики.', tag: 'No tracking' },
];

function FeatureCard({ f, index }) {
  const ref = useReveal(0.12);
  const variant = index % 2 === 0 ? 'reveal-left' : 'reveal-right';
  return (
    <div
      ref={ref}
      className={`${variant} relative p-7 rounded-2xl overflow-hidden`}
      style={{
        transitionDelay: `${index * 100}ms`,
        border: '1px solid rgba(39,39,42,0.85)',
        background: 'linear-gradient(160deg, rgba(24,24,27,0.7) 0%, rgba(24,24,27,0.4) 100%)',
      }}
    >
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          width: 200, height: 200, top: -80, right: -80,
          background: 'rgba(var(--accent-rgb),0.06)',
          filter: 'blur(60px)',
        }}
      />
      <div className="relative flex items-start gap-5">
        <div
          className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: 'rgba(var(--accent-rgb),0.08)',
            border: '1px solid rgba(var(--accent-rgb),0.20)',
          }}
        >
          <f.icon size={22} className="text-lime-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 mb-2 flex-wrap">
            <h3 className="text-xl font-bold text-zinc-100">{f.title}</h3>
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md"
              style={{
                background: 'rgba(39,39,42,0.6)',
                color: '#71717a',
                border: '1px solid rgba(63,63,70,0.5)',
              }}
            >
              {f.tag}
            </span>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
        </div>
      </div>
    </div>
  );
}

export function Features() {
  const headingRef = useReveal(0.15);
  return (
    <section id="features" className="relative px-6 md:px-10 pt-32 pb-24">
      <div className="max-w-6xl mx-auto">
        <div ref={headingRef} className="reveal-blur text-center mb-16">
          <div className="flex justify-center mb-4">
            <Eyebrow icon={Zap}>Возможности</Eyebrow>
          </div>
          <h2
            className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-zinc-100"
            style={{ letterSpacing: '-0.02em' }}
          >
            Всё что нужно. <span className="text-zinc-500">Ничего лишнего.</span>
          </h2>
          <p className="text-base text-zinc-500 max-w-md mx-auto">
            Мы убрали всё, что отвлекает, и оставили только суть
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} f={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
