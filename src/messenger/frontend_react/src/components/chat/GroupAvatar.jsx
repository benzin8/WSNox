// Deterministic colored circle for group chats. Colour is derived from the
// group id so the same group always looks the same across reloads/devices.
const PALETTE = [
  "#7dd3fc", "#a78bfa", "#fb7185", "#facc15",
  "#34d399", "#f97316", "#f472b6", "#60a5fa",
];

function colourFor(id) {
  const n = typeof id === "number" ? id : 0;
  return PALETTE[Math.abs(n) % PALETTE.length];
}

function initialsFor(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function GroupAvatar({ id, name, size = 40, className = "" }) {
  const bg = colourFor(id);
  return (
    <div
      className={`relative rounded-full flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      <span
        className="text-zinc-900 font-bold"
        style={{ fontSize: size * 0.36 }}
      >
        {initialsFor(name)}
      </span>
    </div>
  );
}
