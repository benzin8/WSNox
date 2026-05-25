import { Link } from 'react-router-dom';
import { WSNoxLogo } from './WSNoxLogo';

export function Nav() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 md:px-10"
      style={{
        background: 'rgba(9,9,11,0.72)',
        backdropFilter: 'blur(14px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
        borderBottom: '1px solid rgba(63,63,70,0.25)',
      }}
    >
      <Link to="/" className="flex items-center gap-2.5 group">
        <WSNoxLogo
          size={32}
          className="text-lime-400 transition-transform duration-300 group-hover:rotate-12"
        />
        <span className="text-lg font-semibold tracking-tight text-zinc-100">WSNox</span>
      </Link>
      <div className="hidden md:flex items-center gap-7 text-sm text-zinc-400">
        <a href="#features" className="hover:text-zinc-200 transition-colors">Возможности</a>
        <a href="#how" className="hover:text-zinc-200 transition-colors">Как работает</a>
        <a href="#opensource" className="hover:text-zinc-200 transition-colors">Open source</a>
        <Link to="/auth/login" className="text-zinc-300 hover:text-lime-400 transition-colors">
          Войти
        </Link>
        <Link
          to="/auth/send-code"
          className="px-4 py-1.5 rounded-lg bg-lime-400 text-zinc-900 font-semibold hover:bg-lime-300 transition-colors"
        >
          Попробовать
        </Link>
      </div>
      <div className="md:hidden flex items-center gap-3 text-sm">
        <Link to="/auth/login" className="text-zinc-300 hover:text-lime-400 transition-colors">
          Войти
        </Link>
        <Link
          to="/auth/send-code"
          className="px-4 py-1.5 rounded-lg bg-lime-400 text-zinc-900 font-semibold"
        >
          Попробовать
        </Link>
      </div>
    </nav>
  );
}
