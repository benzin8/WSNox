/**
 * Placeholder для секций, для которых нет данных в MVP.
 * Адаптируется под родительский grid-slot — не задаёт собственную высоту.
 */
export default function ComingSoon({ title, reason }) {
  return (
    <div
      className="h-full w-full rounded-2xl flex flex-col items-center justify-center text-center p-6"
      style={{
        border: '1px dashed rgba(var(--accent-rgb),0.25)',
        background: 'linear-gradient(160deg, color-mix(in oklab, var(--color-zinc-900) 40%, transparent), color-mix(in oklab, var(--color-zinc-900) 20%, transparent))',
        minHeight: 120,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-70" style={{ color: "var(--color-lime-400)" }}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <div className="text-sm font-semibold text-zinc-300 mb-1">{title}</div>
      <div className="text-[11px] italic text-zinc-500 max-w-[260px]">{reason}</div>
      <div className="text-[10px] uppercase text-lime-400 mt-3" style={{ letterSpacing: '0.16em' }}>скоро</div>
    </div>
  );
}
