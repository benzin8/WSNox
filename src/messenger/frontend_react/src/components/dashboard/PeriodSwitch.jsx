const PERIODS = [7, 30, 90];

export default function PeriodSwitch({ days, onChange }) {
  return (
    <div
      className="flex items-center gap-1 p-1 rounded-xl"
      style={{ background: 'rgba(39,39,42,0.4)', border: '1px solid rgba(63,63,70,0.5)' }}
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
              color: on ? 'var(--color-lime-400)' : '#71717a',
            }}
          >
            {d}д
          </button>
        );
      })}
    </div>
  );
}
