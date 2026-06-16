import { useState, useEffect } from 'react';

/**
 * Confirm-модалка: чтобы выдать/снять админку, надо вписать email юзера exact match.
 * Защита от случайного клика.
 */
export default function RoleConfirmModal({ open, onClose, target, grant, onConfirm }) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setInput('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !target) return null;

  const expected = target.email;
  const matches = input.trim().toLowerCase() === expected.toLowerCase();

  const submit = async () => {
    if (!matches) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(target.id, grant, input.trim());
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
          background: 'linear-gradient(180deg, rgba(24,24,27,0.96), rgba(9,9,11,0.98))',
          border: '1px solid rgba(63,63,70,0.7)',
          borderRadius: 24,
          padding: 28,
        }}
      >
        <div className="mb-4">
          <div className="text-[11px] uppercase text-zinc-500 mb-1" style={{ letterSpacing: '0.16em' }}>
            Подтверждение действия
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            {grant ? 'Выдать админку' : 'Снять админку'}
          </h2>
        </div>

        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          Действие: <span className={grant ? 'text-lime-400' : 'text-red-400'}>{grant ? 'выдать' : 'снять'}</span> роль admin для{' '}
          <span className="text-zinc-200 font-medium">{target.name}</span>{' '}
          (<code className="text-xs text-zinc-300">{target.email}</code>).
        </p>
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
          onKeyDown={(e) => { if (e.key === 'Enter' && matches && !submitting) submit(); }}
          className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors"
          style={{
            borderColor: matches ? 'var(--color-lime-400)' : 'rgba(63,63,70,0.7)',
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
            disabled={!matches || submitting}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: grant ? 'var(--color-lime-400)' : '#ef4444',
              color: grant ? '#09090b' : '#fff',
            }}
          >
            {submitting ? '…' : (grant ? 'Выдать' : 'Снять')}
          </button>
        </div>
      </div>
    </div>
  );
}
