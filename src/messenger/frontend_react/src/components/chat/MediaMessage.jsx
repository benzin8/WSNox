import { useCallback, useRef, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { MediaLightbox } from "./MediaLightbox";

const DOUBLE_TAP_MS = 300;

/**
 * Inline media block rendered inside an outgoing/incoming bubble.
 *
 * For images we ship a thumbnail-sized `<img>` and open a lightbox on click.
 * For videos we show a `<video preload="metadata">` — browsers will render
 * the first frame as a poster so we don't need a server-side thumbnail.
 *
 * `isUploading` swaps the bubble for a placeholder with a spinner.
 */
export function MediaMessage({
  type,           // "image" | "video"
  fullUrl,        // presigned URL or local blob URL during upload
  thumbUrl,       // optional smaller URL; falls back to fullUrl
  meta,           // { width, height, duration_ms, ... }
  isUploading,
  onClick,
  onDoubleTap,    // called on second tap within DOUBLE_TAP_MS → reply
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);
  const url = thumbUrl || fullUrl;
  // Compute the displayed aspect-ratio so the bubble doesn't jump when the
  // image finishes loading. Cap the ratio to keep portrait media compact.
  const w = meta?.width ?? meta?.original_width ?? 4;
  const h = meta?.height ?? meta?.original_height ?? 3;
  const aspect = Math.max(0.6, Math.min(2.2, w / h));

  // Single tap opens the lightbox (or fires onClick), double tap fires
  // onDoubleTap (reply). We delay the single-tap action by DOUBLE_TAP_MS
  // so a quick second tap can cancel it — the same pattern MessageBubble
  // uses for "single = action menu, double = reply" on text bubbles.
  const handleTap = useCallback((e) => {
    if (e) e.stopPropagation();
    if (isUploading) return;

    const now = Date.now();
    const diff = now - lastTapRef.current;
    lastTapRef.current = now;

    if (diff < DOUBLE_TAP_MS && onDoubleTap) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      onDoubleTap();
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      if (onClick) onClick();
      else setLightboxOpen(true);
    }, DOUBLE_TAP_MS);
  }, [isUploading, onClick, onDoubleTap]);

  return (
    <div className="relative">
      <div
        className="overflow-hidden rounded-xl bg-zinc-800/60"
        style={{ width: "min(260px, 60vw)", aspectRatio: aspect, maxWidth: "100%" }}
      >
        {type === "image" && url && (
          <img
            src={url}
            alt=""
            className="w-full h-full object-cover cursor-zoom-in"
            loading="lazy"
            onClick={handleTap}
          />
        )}

        {type === "video" && fullUrl && (
          <div className="relative w-full h-full" onClick={handleTap}>
            <video
              src={fullUrl}
              preload="metadata"
              playsInline
              controls={!isUploading}
              className="w-full h-full object-cover"
            />
            {isUploading && (
              <div className="absolute inset-0 grid place-items-center bg-zinc-900/40">
                <Play size={28} className="text-zinc-100/80" />
              </div>
            )}
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 grid place-items-center bg-zinc-950/40 backdrop-blur-[1px] pointer-events-none">
            <Loader2 size={26} className="text-lime-400 animate-spin" />
          </div>
        )}
      </div>

      <MediaLightbox
        open={lightboxOpen}
        type={type}
        url={fullUrl}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
