import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import AmbientGlow from '../components/dashboard/AmbientGlow';
import RoleConfirmModal from '../components/dashboard/RoleConfirmModal';
import { Avatar } from '../components/profile/Avatar';
import { useAdminUsers } from '../hooks/useAdminUsers';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function initials(name) {
  if (!name) return '?';
  return name.trim().slice(0, 1).toUpperCase();
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const { users, loading, error, setRole } = useAdminUsers();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(null); // { target, grant }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.email.toLowerCase().includes(q)
      || u.name.toLowerCase().includes(q)
      || u.username.toLowerCase().includes(q),
    );
  }, [users, query]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-zinc-950 overflow-y-auto" style={{ position: 'relative' }}>
      <AmbientGlow />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <header
          className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 sm:px-8 h-16"
          style={{ background: 'rgba(9,9,11,0.78)', backdropFilter: 'blur(14px) saturate(1.4)', borderBottom: '1px solid rgba(39,39,42,0.6)' }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => navigate('/dashboard')} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#a3e635' }} aria-label="Вернуться к дашборду">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="text-base sm:text-lg font-semibold tracking-tight">WSNox</span>
            <span className="text-zinc-600 hidden sm:inline">/</span>
            <span className="text-sm text-zinc-400 hidden sm:inline">Управление юзерами</span>
          </div>
          <input
            type="text"
            placeholder="Поиск по email / имени"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-900 border text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-lime-400 transition-colors w-48 sm:w-64"
            style={{ borderColor: 'rgba(63,63,70,0.5)' }}
          />
        </header>

        <main className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1200px] mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>Все юзеры</h1>
            <p className="text-zinc-500 mt-1.5 text-sm">Всего: <span className="text-zinc-300 font-medium">{users.length}</span> · admins: <span className="text-lime-400 font-medium">{users.filter(u => u.is_admin).length}</span></p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm text-red-400" style={{ background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.20)' }}>
              {error.message || 'Не удалось загрузить юзеров'}
            </div>
          )}

          <div className="space-y-2">
            {filtered.map(u => (
              <div
                key={u.id}
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl"
                style={{
                  background: 'linear-gradient(160deg, rgba(24,24,27,0.7), rgba(24,24,27,0.4))',
                  border: '1px solid rgba(39,39,42,0.85)',
                }}
              >
                <Avatar
                  url={u.avatar_thumb_url}
                  initials={initials(u.name)}
                  size={40}
                  className={u.is_admin ? 'ring-2 ring-lime-400/60' : ''}
                />
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-zinc-100 truncate">{u.name}</span>
                    {u.is_admin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase" style={{ background: 'rgba(163,230,53,0.15)', color: '#a3e635', letterSpacing: '0.08em' }}>admin</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">{u.email}</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    создан {formatDate(u.created_at)}
                    {u.last_seen && <> · был {formatDate(u.last_seen)}</>}
                  </div>
                </div>
                <button
                  onClick={() => setPending({ target: u, grant: !u.is_admin })}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                  style={{
                    background: u.is_admin ? 'rgba(248,113,113,0.10)' : 'rgba(163,230,53,0.10)',
                    color: u.is_admin ? '#f87171' : '#a3e635',
                    border: `1px solid ${u.is_admin ? 'rgba(248,113,113,0.20)' : 'rgba(163,230,53,0.20)'}`,
                  }}
                >
                  {u.is_admin ? 'Снять' : 'Выдать админку'}
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center text-zinc-500 py-8 text-sm">Никого не нашлось</div>
            )}
          </div>
        </main>
      </div>

      <RoleConfirmModal
        open={pending !== null}
        onClose={() => setPending(null)}
        target={pending?.target}
        grant={pending?.grant ?? false}
        onConfirm={setRole}
      />
    </div>
  );
}
