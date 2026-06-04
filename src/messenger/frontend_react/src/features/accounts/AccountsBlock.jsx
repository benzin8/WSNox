import { Check, LogOut, Plus } from 'lucide-react';
import { Avatar } from '../../components/profile/Avatar';
import { useAccounts } from './useAccounts';
import { switchAccount, removeAccount, beginAddAccount, MAX_ACCOUNTS } from './accountStore';

function initialsOf(name) {
  return (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export function AccountsBlock({ onAddAccount }) {
  const { accounts, activeId } = useAccounts(true);

  const handleAdd = () => {
    beginAddAccount();
    if (onAddAccount) onAddAccount();
    else window.location.assign('/auth/send-code');
  };

  return (
    <div className="w-full mt-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 overflow-hidden">
      <div className="px-4 pt-3 pb-1 text-xs font-medium text-zinc-500">Аккаунты</div>
      <ul className="divide-y divide-zinc-800/60">
        {accounts.map((acc) => {
          const isActive = acc.user_id === activeId;
          const count = acc.unread;
          return (
            <li
              key={acc.user_id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/30 transition-colors cursor-pointer"
              onClick={() => !isActive && switchAccount(acc.user_id)}
            >
              <Avatar url={acc.avatar_url} initials={initialsOf(acc.display_name)} size={36} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-100 truncate">{acc.display_name}</div>
                {acc.needs_login && (
                  <div className="text-xs text-amber-400">нужен вход</div>
                )}
              </div>
              {count > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-lime-400 text-zinc-900 text-xs font-semibold">
                  {count > 99 ? '99+' : count}
                </span>
              )}
              {isActive && <Check size={16} className="text-lime-400 shrink-0" />}
              <button
                onClick={(e) => { e.stopPropagation(); removeAccount(acc.user_id); }}
                className="text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                aria-label="Выйти из аккаунта"
              >
                <LogOut size={15} />
              </button>
            </li>
          );
        })}
      </ul>
      {accounts.length < MAX_ACCOUNTS && (
        <button
          onClick={handleAdd}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-lime-400 hover:bg-zinc-800/30 transition-colors"
        >
          <Plus size={16} />
          Добавить аккаунт
        </button>
      )}
    </div>
  );
}
