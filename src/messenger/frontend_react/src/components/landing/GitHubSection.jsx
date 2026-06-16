import { Github, Star, GitFork, Users, Code, Heart, ArrowUpRight } from 'lucide-react';
import { Eyebrow } from './Eyebrow';
import { Terminal } from './Terminal';
import { useReveal } from './useReveal';

const GITHUB_URL = 'https://github.com/benzin8/WSNox';

export function GitHubSection() {
  const ref = useReveal(0.1);
  return (
    <section id="opensource" className="relative px-6 md:px-10 py-32">
      <div className="max-w-6xl mx-auto">
        <div
          ref={ref}
          className="reveal-scale relative rounded-3xl overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse at top right, rgba(var(--accent-rgb),0.12) 0%, transparent 60%), linear-gradient(180deg, rgba(24,24,27,0.8) 0%, rgba(9,9,11,1) 100%)',
            border: '1px solid rgba(63,63,70,0.6)',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.15]"
            style={{
              backgroundImage: 'linear-gradient(rgba(var(--accent-rgb),0.30) 1px, transparent 1px)',
              backgroundSize: '100% 28px',
              maskImage: 'radial-gradient(ellipse at left center, black 0%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(ellipse at left center, black 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute pointer-events-none rounded-full"
            style={{
              width: 500, height: 500, right: -100, top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(var(--accent-rgb),0.10)',
              filter: 'blur(120px)',
            }}
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 p-8 md:p-14">
            <div className="flex flex-col justify-center">
              <Eyebrow icon={Code}>Open Source</Eyebrow>
              <h2
                className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-100 mt-5 mb-5"
                style={{ letterSpacing: '-0.02em', lineHeight: 1.05 }}
              >
                Сделано <span className="text-lime-400">открыто</span>.<br />
                Проверяемо. Свободно.
              </h2>
              <p className="text-zinc-400 leading-relaxed mb-8 text-base md:text-[17px]">
                Весь код WSNox — на GitHub. Можно изучить, форкнуть, поднять
                собственный сервер. Никаких чёрных ящиков и обещаний на словах.
              </p>

              <div className="flex flex-wrap items-center gap-x-7 gap-y-3 mb-8">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Star size={18} className="text-lime-400" />
                  <span className="font-bold text-zinc-100">2.4k</span>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Stars</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <GitFork size={18} className="text-lime-400" />
                  <span className="font-bold text-zinc-100">187</span>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Forks</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <Users size={18} className="text-lime-400" />
                  <span className="font-bold text-zinc-100">24</span>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Контрибьюторов</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative inline-flex items-center gap-3 rounded-xl font-semibold pl-5 pr-3 py-3.5 text-zinc-900 overflow-hidden transition-transform hover:scale-[1.01]"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-lime-300) 0%, var(--color-lime-400) 50%, var(--color-lime-500) 100%)',
                    boxShadow:
                      '0 18px 40px rgba(var(--accent-rgb),0.30), inset 0 1px 0 rgba(255,255,255,0.4)',
                  }}
                >
                  <Github size={20} />
                  <span className="flex flex-col leading-tight text-left">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-800/80 font-mono">
                      github.com
                    </span>
                    <span className="font-bold text-sm">benzin8 / WSNox</span>
                  </span>
                  <span
                    className="ml-2 w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(24,24,27,0.85)', color: 'var(--color-lime-400)' }}
                  >
                    <ArrowUpRight size={16} />
                  </span>
                </a>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl font-semibold px-5 py-3.5 text-zinc-300 text-sm hover:text-zinc-100 transition-colors"
                  style={{
                    background: 'rgba(39,39,42,0.4)',
                    border: '1px solid rgba(63,63,70,0.6)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <Star size={16} />
                  Поставить звезду
                </a>
              </div>

              <p className="mt-6 text-xs text-zinc-500 flex items-center gap-1.5">
                Сделано с <Heart size={12} className="text-lime-400" /> и большим количеством кофе
              </p>
            </div>

            <div className="flex items-center">
              <Terminal />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
