import { useState, useEffect } from 'react';
import { ROLE_LABELS } from '../../features/roles';

/**
 * Confirm-модалка смены роли: выбрать новую роль из доступных + вписать email
 * юзера exact match (защита от случайного клика).
 *
 * props:
 *   open, onClose, target {id,name,email,role}
 *   options: string[] — роли, которые актор может назначить этому таргету
 *   onConfirm(targetId, role, email) -> Promise
 */
export default function RoleConfirmModal({ open, onClose, target, options = [], onConfirm }) {
  const [role, setRole] = useState('');
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setRole(options[0] || '');
      setInput('');
      setSubmitting(false);
      setError(null);
    }
  }, [open, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !target) return null;

  const expected = target.email;
  const matches = input.trim().toLowerCase() === expected.toLowerCase();
  const changed = role && role !== target.role;
  const ready = matches && changed;

  const submit = async () => {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(target.id, role, input.trim());
      onClose();
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 480,
          background: 'linear-gradient(180deg, color-mix(in oklab, var(--color-zinc-900) 96%, transparent), color-mix(in oklab, var(--color-zinc-950) 98%, transparent))',
          border: '1px solid color-mix(in oklab, var(--color-zinc-700) 70%, transparent)',
          borderRadius: 24,
          padding: 28,
        }}
      >
        <div className="mb-4">
          <div className="text-[11px] uppercase text-zinc-500 mb-1" style={{ letterSpacing: '0.16em' }}>
            Подтверждение действия
          </div>
          <h2 className="text-xl font-bold tracking-tight">Изменить роль</h2>
        </div>

        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          Пользователь <span className="text-zinc-200 font-medium">{target.name}</span>{' '}
          (<code className="text-xs text-zinc-300">{target.email}</code>).
          Текущая роль: <span className="text-zinc-200">{ROLE_LABELS[target.role] || target.role}</span>.
        </p>

        <label className="text-sm text-zinc-400 mb-1.5 block">Новая роль</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={submitting}
          className="w-full px-4 py-2.5 mb-4 rounded-xl bg-zinc-900 border text-zinc-100 focus:outline-none transition-colors"
          style={{ borderColor: 'color-mix(in oklab, var(--color-zinc-700) 70%, transparent)' }}
        >
          {options.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
          ))}
        </select>

        <p className="text-sm text-zinc-400 mb-3">
          Для подтверждения введи email юзера ровно как выше:
        </p>

        <input
          type="email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={expected}
          autoFocus
          disabled={submitting}
          onKeyDown={(e) => { if (e.key === 'Enter' && ready && !submitting) submit(); }}
          className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors"
          style={{
            borderColor: matches ? 'var(--color-lime-400)' : 'color-mix(in oklab, var(--color-zinc-700) 70%, transparent)',
          }}
        />

        {error && (
          <div className="mt-3 text-xs text-red-400">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!ready || submitting}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-lime-400)', color: '#09090b' }}
          >
            {submitting ? '…' : 'Применить'}
          </button>
        </div>
      </div>
    </div>
  );
}
