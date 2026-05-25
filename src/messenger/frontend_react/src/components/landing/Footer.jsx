import { MessageCircle, Github } from 'lucide-react';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="px-6 md:px-10 py-10" style={{ borderTop: '1px solid rgba(39,39,42,0.6)' }}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-lime-400 flex items-center justify-center">
            <MessageCircle size={14} strokeWidth={2.5} className="text-zinc-900" />
          </div>
          <span className="text-sm font-semibold text-zinc-300">WSNox</span>
          <span className="text-xs text-zinc-600 ml-2">© {year}</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-zinc-500">
          <a href="#" className="hover:text-zinc-300 transition-colors">Условия</a>
          <a href="#" className="hover:text-zinc-300 transition-colors">Приватность</a>
          <a
            href="https://github.com/wsnox/wsnox"
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
