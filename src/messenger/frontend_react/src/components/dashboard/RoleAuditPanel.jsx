import { useAdminAudit } from '../../hooks/useAdminAudit';
import { ROLE_LABELS } from '../../features/roles';

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Журнал изменений ролей. Только метаданные RBAC-действий (кто, кому, когда) —
 * никакого приватного контента пользователей.
 */
export default function RoleAuditPanel() {
  const { entries, loading, error } = useAdminAudit(true);

  return (
    <div
      className="rounded-2xl p-5 mt-6"
      style={{
        background: 'linear-gradient(160deg, color-mix(in oklab, var(--color-zinc-900) 70%, transparent), color-mix(in oklab, var(--color-zinc-900) 40%, transparent))',
        border: '1px solid color-mix(in oklab, var(--color-zinc-800) 85%, transparent)',
      }}
    >
      <h3 className="font-semibold tracking-tight mb-1">Журнал изменений ролей</h3>
      <p className="text-xs text-zinc-500 mb-4">Последние действия с ролями. Только метаданные — без приватных данных.</p>

      {loading && <div className="text-sm text-zinc-500">Загрузка…</div>}
      {error && <div className="text-sm text-red-400">Не удалось загрузить журнал</div>}
      {!loading && !error && entries.length === 0 && (
        <div className="text-sm text-zinc-500">Пока нет записей</div>
      )}

      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 text-sm py-2 border-b border-zinc-800/50 last:border-0">
            <div className="min-w-0">
              <span className="text-zinc-300">{e.target_email}</span>
              <span className="text-zinc-600 mx-1.5">:</span>
              <span className="text-zinc-500">{ROLE_LABELS[e.old_role] || e.old_role}</span>
              <span className="text-zinc-600 mx-1">→</span>
              <span className="text-lime-400">{ROLE_LABELS[e.new_role] || e.new_role}</span>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-zinc-500">{e.actor_email}</div>
              <div className="text-[10px] text-zinc-600">{fmt(e.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
