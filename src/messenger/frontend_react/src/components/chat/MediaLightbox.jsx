import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Full-screen viewer for an image or video.
 *
 * Single media: pass `url`. Album: pass `urls` (array) + `index` +
 * `onIndexChange` to page through with arrows / keyboard / swipe.
 *
 * Renders via Portal directly into document.body so it cannot be clipped or
 * mis-positioned by ancestor `transform`/`filter`/`contain` (which break
 * `position: fixed` in CSS — easy to hit when a chat bubble has an active
 * swipe transform). While open the page scroll is locked.
 */
export function MediaLightbox({ open, type, url, urls, index = 0, onIndexChange, onClose }) {
  const list = urls && urls.length ? urls : (url ? [url] : []);
  const canPage = list.length > 1 && typeof onIndexChange === "function";
  const i = urls && urls.length ? Math.max(0, Math.min(index, list.length - 1)) : 0;
  const current = list[i];
  const touchRef = useRef(null);

  const go = (delta) => {
    if (!canPage) return;
    onIndexChange(Math.max(0, Math.min(i + delta, list.length - 1)));
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && canPage) onIndexChange(Math.max(0, i - 1));
      else if (e.key === "ArrowRight" && canPage) onIndexChange(Math.min(list.length - 1, i + 1));
    };
    document.addEventListener("keydown", onKey);
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [open, onClose, canPage, i, list.length, onIndexChange]);

  if (!open || !current || typeof document === "undefined") return null;

  // Distinguish a tap (close) from a horizontal swipe (page) on touch devices.
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, moved: false };
  };
  const onTouchMove = (e) => {
    if (!touchRef.current) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - touchRef.current.x) > 10 || Math.abs(t.clientY - touchRef.current.y) > 10) {
      touchRef.current.moved = true;
    }
  };
  const onTouchEndImg = (e) => {
    const tr = touchRef.current;
    touchRef.current = null;
    if (!tr) { onClose(); return; }
    const dx = (e.changedTouches[0]?.clientX ?? tr.x) - tr.x;
    if (canPage && Math.abs(dx) > 40) { go(dx < 0 ? 1 : -1); return; }
    if (!tr.moved) onClose();
  };

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

      {canPage && (
        <div
          style={{
            position: "absolute",
            top: "max(env(safe-area-inset-top), 18px)",
            left: "50%",
            transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.85)",
            fontSize: 13,
            fontWeight: 600,
            background: "rgba(0,0,0,0.4)",
            padding: "4px 10px",
            borderRadius: 9999,
          }}
        >
          {i + 1} / {list.length}
        </div>
      )}

      {canPage && i > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(-1); }}
          aria-label="Предыдущее"
          className="text-zinc-100 hover:text-white"
          style={navBtnStyle("left")}
        >
          <ChevronLeft size={26} />
        </button>
      )}
      {canPage && i < list.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(1); }}
          aria-label="Следующее"
          className="text-zinc-100 hover:text-white"
          style={navBtnStyle("right")}
        >
          <ChevronRight size={26} />
        </button>
      )}

      {type === "video" ? (
        <video
          src={current}
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "100vw", maxHeight: "100vh", background: "#000", outline: "none" }}
        />
      ) : (
        <img
          src={current}
          alt=""
          onClick={(e) => { e.stopPropagation(); if (!canPage) onClose(); }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={(e) => { e.stopPropagation(); onTouchEndImg(e); }}
          draggable={false}
          style={{ maxWidth: "100vw", maxHeight: "100vh", objectFit: "contain", userSelect: "none" }}
        />
      )}
    </div>,
    document.body,
  );
}

function navBtnStyle(side) {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: "max(env(safe-area-inset-" + side + "), 8px)",
    width: 44,
    height: 44,
    display: "grid",
    placeItems: "center",
    borderRadius: "9999px",
    background: "rgba(0,0,0,0.45)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.08)",
  };
}
