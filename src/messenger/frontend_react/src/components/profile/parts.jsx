import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function Cover({ height = 112 }) {
  return (
    <div className="relative overflow-hidden" style={{ height }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(125% 150% at 50% -30%, rgba(var(--accent-rgb),0.38), rgba(var(--accent-rgb),0.06) 45%, transparent 72%), linear-gradient(180deg, #101013, #0a0a0c)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 80% 100% at 50% 0%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 100% at 50% 0%, black, transparent 75%)",
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 200,
          height: 200,
          left: "50%",
          bottom: -120,
          transform: "translateX(-50%)",
          background: "rgba(var(--accent-rgb),0.14)",
          filter: "blur(50px)",
        }}
      />
    </div>
  );
}

const TONE_STYLES = {
  lime: { bg: "rgba(var(--accent-rgb),0.10)", color: "var(--color-lime-400)", border: "rgba(var(--accent-rgb),0.22)" },
  zinc: { bg: "rgba(39,39,42,0.5)", color: "#a1a1aa", border: "rgba(63,63,70,0.6)" },
  amber: { bg: "rgba(251,191,36,0.10)", color: "#fbbf24", border: "rgba(251,191,36,0.22)" },
};

export function Pill({ tone = "lime", children }) {
  const t = TONE_STYLES[tone] || TONE_STYLES.lime;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap"
      style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
    >
      {children}
    </span>
  );
}

export function Tile({ children }) {
  return (
    <div
      className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
      style={{
        background: "rgba(39,39,42,0.6)",
        border: "1px solid rgba(63,63,70,0.6)",
        color: "#a1a1aa",
      }}
    >
      {children}
    </div>
  );
}

export function MetaRow({ icon, label, value, copyable }) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      // clipboard unavailable (insecure context); silent no-op
    }
  };

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
      style={{
        background: "rgba(39,39,42,0.3)",
        border: "1px solid rgba(63,63,70,0.6)",
      }}
    >
      <Tile>{icon}</Tile>
      <div className="min-w-0 flex-grow">
        <div className="text-[11px] text-zinc-500 leading-none mb-1">{label}</div>
        <div className="text-sm text-zinc-200 truncate">{value}</div>
      </div>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            color: done ? "var(--color-lime-400)" : "#71717a",
            background: done ? "rgba(var(--accent-rgb),0.08)" : "transparent",
            transition: "color .15s ease, background-color .15s ease",
          }}
          aria-label="Скопировать"
        >
          {done ? <Check size={16} /> : <Copy size={16} />}
        </button>
      )}
    </div>
  );
}
