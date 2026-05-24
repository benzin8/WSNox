import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageCircle,
  Shield,
  Zap,
  Globe,
  ArrowRight,
  Lock,
  Sparkles,
} from 'lucide-react';

function useScrollReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed');
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function RevealSection({ children, className = '', delay = 0 }) {
  const ref = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`reveal-block ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

const features = [
  {
    icon: Zap,
    title: 'Мгновенно',
    desc: 'Сообщения доставляются за миллисекунды через WebSocket. Никаких задержек, никаких перезагрузок.',
  },
  {
    icon: Shield,
    title: 'Безопасно',
    desc: 'Шифрование на каждом уровне. Ваши данные принадлежат только вам.',
  },
  {
    icon: Globe,
    title: 'Везде',
    desc: 'PWA-приложение работает на любом устройстве — телефон, планшет, десктоп.',
  },
  {
    icon: Lock,
    title: 'Приватно',
    desc: 'Никакой рекламы, никакого отслеживания. Только вы и ваши собеседники.',
  },
];

export default function LandingPage() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide">
      {/* — Nav — */}
      <nav className="fixed top-0 left-0 right-0 z-50 nav-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-lime-400 flex items-center justify-center transition-transform duration-300 group-hover:rotate-12">
              <MessageCircle className="w-4.5 h-4.5 text-zinc-900" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-semibold tracking-tight text-zinc-100">
              WSNox
            </span>
          </Link>
          <Link
            to="/auth/login"
            className="text-sm text-zinc-400 hover:text-lime-400 transition-colors duration-200"
          >
            Войти
          </Link>
        </div>
      </nav>

      {/* — Hero — */}
      <section className="relative min-h-dvh flex items-center justify-center px-6 pt-16">
        {/* Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-lime-400/[0.04] blur-[120px] pointer-events-none" />
        <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-lime-400/[0.03] blur-[80px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="hero-stagger">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/40 text-xs text-zinc-400 mb-8 backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5 text-lime-400" />
              <span>Бесплатный мессенджер нового поколения</span>
            </div>
          </div>

          <h1 className="hero-stagger text-5xl sm:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            Общение без{' '}
            <span className="relative inline-block">
              <span className="relative z-10 text-lime-400">лишнего</span>
              <span className="absolute bottom-1 left-0 right-0 h-3 bg-lime-400/15 rounded-sm -z-0" />
            </span>
          </h1>

          <p className="hero-stagger text-lg sm:text-xl text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Быстрый, приватный, минималистичный. WSNox — мессенджер, который не мешает вам общаться.
          </p>

          <div className="hero-stagger flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/auth/send-code"
              className="group relative inline-flex items-center gap-2 px-7 py-3.5 bg-lime-400 text-zinc-900 rounded-xl font-semibold text-sm transition-all duration-300 hover:bg-lime-300 hover:shadow-[0_0_30px_rgba(163,230,53,0.25)] active:scale-[0.97]"
            >
              Начать общение
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/auth/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm text-zinc-300 border border-zinc-700/60 bg-zinc-800/30 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
            >
              У меня есть аккаунт
            </Link>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-zinc-600">
          <span className="text-[11px] uppercase tracking-[0.2em]">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-zinc-600 to-transparent scroll-line" />
        </div>
      </section>

      {/* — Features — */}
      <section className="relative px-6 py-32">
        <div className="max-w-5xl mx-auto">
          <RevealSection className="text-center mb-20">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Всё что нужно.{' '}
              <span className="text-zinc-500">Ничего лишнего.</span>
            </h2>
            <p className="text-zinc-500 max-w-md mx-auto">
              Мы убрали всё, что отвлекает, и оставили только суть
            </p>
          </RevealSection>

          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((f, i) => (
              <RevealSection key={f.title} delay={i * 80}>
                <div className="group relative p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 transition-all duration-500 hover:border-zinc-700/80 hover:bg-zinc-800/30">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center transition-colors duration-300 group-hover:bg-lime-400/10 group-hover:border-lime-400/20">
                      <f.icon className="w-5 h-5 text-zinc-400 transition-colors duration-300 group-hover:text-lime-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-zinc-100 mb-1">{f.title}</h3>
                      <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* — CTA — */}
      <section className="relative px-6 py-32">
        <div className="absolute inset-0 bg-gradient-to-t from-lime-400/[0.02] to-transparent pointer-events-none" />
        <RevealSection className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Готовы попробовать?
          </h2>
          <p className="text-zinc-500 mb-8 max-w-md mx-auto">
            Регистрация занимает 30 секунд. Без номера телефона, без лишних данных.
          </p>
          <Link
            to="/auth/send-code"
            className="group inline-flex items-center gap-2 px-8 py-4 bg-lime-400 text-zinc-900 rounded-xl font-semibold transition-all duration-300 hover:bg-lime-300 hover:shadow-[0_0_40px_rgba(163,230,53,0.2)] active:scale-[0.97]"
          >
            Создать аккаунт
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </RevealSection>
      </section>

      {/* — Footer — */}
      <footer className="px-6 py-10 border-t border-zinc-800/60">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <MessageCircle className="w-4 h-4" />
            <span>WSNox</span>
          </div>
          <span className="text-xs text-zinc-700">
            {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
