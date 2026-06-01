import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Full-screen viewer for an image or video. Renders to a real fixed overlay
 * (not a button) so default UA button styles can't bleed in. Esc closes the
 * viewer, backdrop click closes it, and the media itself stops propagation
 * so clicking on the photo doesn't dismiss.
 */
export function MediaLightbox({ open, type, url, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !url) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр медиа"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center animate-fadeIn"
      style={{
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(16px) saturate(1.2)",
        WebkitBackdropFilter: "blur(16px) saturate(1.2)",
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Закрыть"
        className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full text-zinc-200 hover:text-white hover:bg-white/10 transition-colors"
        style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
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
          className="max-w-[95vw] max-h-[90vh] rounded-lg shadow-2xl"
          style={{ background: "#000" }}
        />
      ) : (
        <img
          src={url}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          draggable={false}
        />
      )}
    </div>
  );
}
