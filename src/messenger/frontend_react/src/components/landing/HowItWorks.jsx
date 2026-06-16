import { Mail, Shield, MessageCircle, Sparkles } from 'lucide-react';
import { Eyebrow } from './Eyebrow';
import { useReveal } from './useReveal';

const STEPS = [
  { n: '01', icon: Mail,           title: 'Email',  desc: 'Введите свой email. Без номера телефона.' },
  { n: '02', icon: Shield,         title: 'Код',    desc: 'Получите 6-значный код на почту.' },
  { n: '03', icon: MessageCircle,  title: 'Готово', desc: 'Заполните профиль и начинайте общение.' },
];

function StepCard({ s, index }) {
  const ref = useReveal(0.15);
  return (
    <div
      ref={ref}
      className="reveal-up relative flex flex-col items-center text-center"
      style={{ transitionDelay: `${index * 120}ms` }}
    >
      <div
        className="relative w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: '#09090b',
          border: '1px solid rgba(var(--accent-rgb),0.25)',
          boxShadow: '0 0 40px rgba(var(--accent-rgb),0.10)',
        }}
      >
        <s.icon size={28} className="text-lime-400" />
        <div
          className="absolute -top-2 -right-2 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold"
          style={{ background: 'var(--color-lime-400)', color: '#18181b' }}
        >
          {s.n}
        </div>
      </div>
      <h3 className="text-lg font-bold text-zinc-100 mb-1.5">{s.title}</h3>
      <p className="text-sm text-zinc-500 max-w-[220px] leading-relaxed">{s.desc}</p>
    </div>
  );
}

export function HowItWorks() {
  const headingRef = useReveal(0.15);
  return (
    <section id="how" className="relative px-6 md:px-10 py-24">
      <div className="max-w-6xl mx-auto">
        <div ref={headingRef} className="reveal-up text-center mb-14">
          <div className="flex justify-center mb-4">
            <Eyebrow icon={Sparkles}>Регистрация за 30 секунд</Eyebrow>
          </div>
          <h2
            className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-zinc-100"
            style={{ letterSpacing: '-0.02em' }}
          >
            Как это работает
          </h2>
          <p className="text-base text-zinc-500 max-w-md mx-auto">
            Без номеров телефонов и сложных форм. Три простых шага.
          </p>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4">
          <div
            className="absolute pointer-events-none hidden md:block"
            style={{
              left: '16%', right: '16%', top: 40, height: 2,
              background:
                'linear-gradient(to right, transparent, rgba(var(--accent-rgb),0.35) 20%, rgba(var(--accent-rgb),0.35) 80%, transparent)',
            }}
          />
          {STEPS.map((s, i) => (
            <StepCard key={s.n} s={s} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
