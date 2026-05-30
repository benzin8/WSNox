import { useState } from "react";

export function Avatar({ url, initials, online, size = 40, className = "" }) {
  const [failed, setFailed] = useState(false);
  const showImage = url && !failed;
  return (
    <div
      className={`relative rounded-full overflow-hidden bg-lime-400 flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
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
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-zinc-900 ${
            online ? "bg-lime-400" : "bg-zinc-600"
          }`}
          style={{ width: size * 0.22, height: size * 0.22 }}
        />
      )}
    </div>
  );
}
