import { useState } from "react";
import { Loader2 } from "lucide-react";
import { pickAlbumLayout } from "./albumLayout.js";
import { MediaLightbox } from "./MediaLightbox";

/**
 * Renders an album (2..10 photos) as a Telegram-style collage bubble.
 *
 * Tiles are square except the 3-photo layout's wide top tile, so rows always
 * line up without needing Telegram's full mosaic algorithm. The caption is
 * rendered by MessageList via the normal bubble-text path, not here.
 *
 * Props:
 *  - photos: [{ id, url, thumbUrl, progress, status }] (already album-ordered)
 */
export function AlbumMessage({ photos, width = "min(460px, 78vw)" }) {
  const [lightbox, setLightbox] = useState(-1);
  const layout = pickAlbumLayout(photos.length);

  const tile = (p, idx, aspect) => (
    <button
      key={p.id ?? idx}
      type="button"
      onClick={(e) => { e.stopPropagation(); if (p.status !== "uploading") setLightbox(idx); }}
      className={`relative overflow-hidden bg-zinc-800/60 ${aspect}`}
    >
      <img
        src={p.thumbUrl || p.url}
        alt=""
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {p.status === "uploading" && (
        <div className="absolute inset-0 grid place-items-center bg-zinc-950/40 backdrop-blur-[1px]">
          {typeof p.progress === "number" && p.progress > 0 ? (
            <span className="text-xs font-medium text-zinc-100">{p.progress}%</span>
          ) : (
            <Loader2 size={20} className="text-lime-400 animate-spin" />
          )}
        </div>
      )}
      {p.status === "failed" && (
        <div className="absolute inset-0 grid place-items-center bg-red-900/40 text-red-200 text-base font-bold">!</div>
      )}
    </button>
  );

  let grid;
  if (layout.kind === "two") {
    grid = (
      <div className="grid grid-cols-2 gap-0.5" style={{ width }}>
        {photos.map((p, i) => tile(p, i, "aspect-square"))}
      </div>
    );
  } else if (layout.kind === "one-plus-two") {
    grid = (
      <div className="flex flex-col gap-0.5" style={{ width }}>
        <div className="grid grid-cols-1">{tile(photos[0], 0, "aspect-[16/9]")}</div>
        <div className="grid grid-cols-2 gap-0.5">
          {tile(photos[1], 1, "aspect-square")}
          {tile(photos[2], 2, "aspect-square")}
        </div>
      </div>
    );
  } else {
    const cols = photos.length === 4 ? "grid-cols-2" : "grid-cols-3";
    grid = (
      <div className={`grid gap-0.5 ${cols}`} style={{ width }}>
        {photos.map((p, i) => tile(p, i, "aspect-square"))}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-xl">{grid}</div>
      <MediaLightbox
        open={lightbox >= 0}
        type="image"
        urls={photos.map((p) => p.url || p.thumbUrl)}
        index={lightbox >= 0 ? lightbox : 0}
        onIndexChange={setLightbox}
        onClose={() => setLightbox(-1)}
      />
    </div>
  );
}
