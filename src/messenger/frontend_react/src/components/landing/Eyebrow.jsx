export function Eyebrow({ icon: Icon, children }) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-[0.18em] text-lime-400"
      style={{
        background: 'rgba(163,230,53,0.07)',
        border: '1px solid rgba(163,230,53,0.20)',
      }}
    >
      {Icon && <Icon size={12} />}
      <span>{children}</span>
    </div>
  );
}
