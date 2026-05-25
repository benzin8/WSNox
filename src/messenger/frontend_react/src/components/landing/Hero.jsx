import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, Github, Check } from 'lucide-react';
import { ChatPreview } from './ChatPreview';

export function Hero() {
  return (
    <section className="relative h-[900px] flex items-center justify-center px-6 pt-16 overflow-hidden">
      {/* Glow center */}
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          width: 900, height: 900, left: '50%', top: '52%',
          transform: 'translate(-50%,-50%)',
          background: 'rgba(163,230,53,0.05)',
          filter: 'blur(140px)',
        }}
      />
      {/* Glow top-right */}
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          width: 420, height: 420, left: '76%', top: '28%',
          transform: 'translate(-50%,-50%)',
          background: 'rgba(163,230,53,0.04)',
          filter: 'blur(100px)',
        }}
      />
      {/* Grid bg */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.25]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
        }}
      />

      <div className="relative max-w-3xl mx-auto text-center">
        <div className="flex justify-center mb-8">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs text-zinc-400"
            style={{
              border: '1px solid rgba(63,63,70,0.6)',
              background: 'rgba(39,39,42,0.4)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <Sparkles size={14} className="text-lime-400" />
            <span>Бесплатный мессенджер нового поколения</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">v1.0 beta</span>
          </div>
        </div>

        <h1
          className="font-bold tracking-tight mb-6 text-zinc-100 text-5xl md:text-[86px]"
          style={{ lineHeight: 1.04, letterSpacing: '-0.03em' }}
        >
          Общение без{' '}
          <span className="relative inline-block">
            <span className="relative z-10 text-lime-400">лишнего</span>
            <span
              className="absolute left-0 right-0 rounded-sm"
              style={{ bottom: 10, height: 14, background: 'rgba(163,230,53,0.15)', zIndex: 0 }}
            />
          </span>
        </h1>

        <p className="text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed text-lg md:text-xl">
          Быстрый, приватный, минималистичный. WSNox — мессенджер,
          который не мешает вам думать и общаться.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/auth/send-code"
            className="group inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-sm bg-lime-400 text-zinc-900 px-7 py-3.5 hover:bg-lime-300 transition-colors"
            style={{ boxShadow: '0 12px 32px rgba(163,230,53,0.30)' }}
          >
            Начать общение
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#opensource"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm text-zinc-300"
            style={{
              border: '1px solid rgba(63,63,70,0.6)',
              background: 'rgba(39,39,42,0.3)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <Github size={16} className="text-zinc-400" />
            Посмотреть код
          </a>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Check size={14} className="text-lime-400" />
            Без номера телефона
          </div>
          <div className="flex items-center gap-1.5">
            <Check size={14} className="text-lime-400" />
            Open source
          </div>
          <div className="flex items-center gap-1.5">
            <Check size={14} className="text-lime-400" />
            PWA · работает офлайн
          </div>
        </div>
      </div>

      {/* Tilted chat preview underneath */}
      <div
        className="absolute left-1/2 pointer-events-none hidden lg:block"
        style={{
          bottom: -60,
          transform: 'translateX(-50%) perspective(2400px) rotateX(28deg)',
          transformOrigin: 'center top',
          width: 1100,
        }}
      >
        <ChatPreview />
      </div>
    </section>
  );
}
