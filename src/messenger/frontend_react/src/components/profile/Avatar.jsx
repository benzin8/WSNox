import { useState } from "react";

export function Avatar({ url, initials, online, size = 40, className = "", ring = false }) {
  const [failed, setFailed] = useState(false);
  const showImage = url && !failed;

  const ringStyle = ring
    ? {
        boxShadow:
          "0 0 0 4px #09090b, 0 0 0 6px rgba(var(--accent-rgb),0.35), 0 12px 32px rgba(var(--accent-rgb),0.20)",
      }
    : undefined;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        className={`rounded-full w-full h-full overflow-hidden bg-lime-400 flex items-center justify-center select-none ${
          online && !ring ? "avatar-online" : ""
        }`}
        style={ringStyle}
      >
        {showImage && (
          <img
            key={url}
            src={url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}
        {!showImage && (
          <span
            className="text-zinc-900 font-bold"
            style={{ fontSize: size * 0.4 }}
          >
            {initials}
          </span>
        )}
      </div>

      {online && ring && (
        <span
          className="absolute rounded-full"
          style={{
            width: size * 0.2,
            height: size * 0.2,
            right: size * 0.04,
            bottom: size * 0.04,
            background: "var(--color-lime-400)",
            border: `${Math.max(2, size * 0.035)}px solid #09090b`,
            boxShadow: "0 0 10px rgba(var(--accent-rgb),0.8)",
          }}
        />
      )}
    </div>
  );
}
