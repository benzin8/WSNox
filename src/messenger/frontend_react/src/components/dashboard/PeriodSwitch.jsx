const PERIODS = [7, 30, 90];

export default function PeriodSwitch({ days, onChange }) {
  return (
    <div
      className="flex items-center gap-1 p-1 rounded-xl"
      style={{ background: 'color-mix(in oklab, var(--color-zinc-800) 40%, transparent)', border: '1px solid color-mix(in oklab, var(--color-zinc-700) 50%, transparent)' }}
    >
      {PERIODS.map(d => {
        const on = d === days;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${on ? 'font-semibold' : ''}`}
            style={{
              background: on ? 'rgba(var(--accent-rgb),0.12)' : 'transparent',
              color: on ? 'var(--color-lime-400)' : 'var(--color-zinc-500)',
            }}
          >
            {d}д
          </button>
        );
      })}
    </div>
  );
}
