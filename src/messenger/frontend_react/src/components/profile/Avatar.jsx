import { useState } from "react";

export function Avatar({ url, initials, online, size = 40, className = "" }) {
  const [failed, setFailed] = useState(false);
  const showImage = url && !failed;
  return (
    <div
      className={`relative rounded-full overflow-hidden bg-lime-400 flex items-center justify-center select-none ${
        online ? "avatar-online" : ""
      } ${className}`}
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
    </div>
  );
}
