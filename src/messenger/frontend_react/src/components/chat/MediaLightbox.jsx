import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Full-screen viewer for an image or video.
 *
 * Renders via Portal directly into document.body so it cannot be clipped or
 * mis-positioned by ancestor `transform`/`filter`/`contain` (which break
 * `position: fixed` in CSS — easy to hit when a chat bubble has an active
 * swipe transform). While open the page scroll is locked so the page behind
 * doesn't move when scrolling on a tall image.
 */
export function MediaLightbox({ open, type, url, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Lock the body / html scroll while the viewer is open.
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [open, onClose]);

  if (!open || !url || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр медиа"
      onClick={onClose}
      className="animate-fadeIn"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(18px) saturate(1.2)",
        WebkitBackdropFilter: "blur(18px) saturate(1.2)",
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Закрыть"
        className="text-zinc-100 hover:text-white transition-colors"
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top), 16px)",
          right: "max(env(safe-area-inset-right), 16px)",
          width: 42,
          height: 42,
          display: "grid",
          placeItems: "center",
          borderRadius: "9999px",
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <X size={20} />
      </button>

      {type === "video" ? (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: "100vw",
            maxHeight: "100vh",
            background: "#000",
            outline: "none",
          }}
        />
      ) : (
        <img
          src={url}
          alt=""
          // Tapping the photo closes the viewer (expected mobile UX — there's no
          // Esc key and the image covers most of the screen, so otherwise it was
          // impossible to close on a phone). stopPropagation prevents the click
          // from also reaching the message bubble underneath.
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          draggable={false}
          style={{
            maxWidth: "100vw",
            maxHeight: "100vh",
            objectFit: "contain",
            userSelect: "none",
          }}
        />
      )}
    </div>,
    document.body,
  );
}
