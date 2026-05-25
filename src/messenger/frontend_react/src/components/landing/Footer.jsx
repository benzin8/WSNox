import { Github } from 'lucide-react';
import { WSNoxLogo } from './WSNoxLogo';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="px-6 md:px-10 py-10" style={{ borderTop: '1px solid rgba(39,39,42,0.6)' }}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <WSNoxLogo size={22} className="text-lime-400" />
          <span className="text-sm font-semibold text-zinc-300">WSNox</span>
          <span className="text-xs text-zinc-600 ml-2">© {year}</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-zinc-500">
          <a href="#" className="hover:text-zinc-300 transition-colors">Условия</a>
          <a href="#" className="hover:text-zinc-300 transition-colors">Приватность</a>
          <a
            href="https://github.com/benzin8/WSNox"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-zinc-300 transition-colors"
          >
            <Github size={12} />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
