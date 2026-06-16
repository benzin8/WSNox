import { useEffect, useMemo, useState } from "react";
import { Send, X } from "lucide-react";

/**
 * Pre-send preview for a picked image or video.
 *
 * Probes width/height (and duration for video) from the file before sending so
 * the upstream upload helper can attach client-side meta — saves us a server-
 * side ffmpeg dependency.
 */
export function MediaPreviewModal({ file, onCancel, onSend }) {
  const [caption, setCaption] = useState("");
  const [meta, setMeta] = useState(null);
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const isVideo = file?.type?.startsWith("video/");

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);

  useEffect(() => {
    if (!file || !objectUrl) return;
    let cancelled = false;
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = objectUrl;
      v.onloadedmetadata = () => {
        if (cancelled) return;
        setMeta({
          width: v.videoWidth || 0,
          height: v.videoHeight || 0,
          duration_ms: Math.round((v.duration || 0) * 1000),
        });
      };
    } else {
      const img = new Image();
      img.src = objectUrl;
      img.onload = () => {
        if (cancelled) return;
        setMeta({ width: img.naturalWidth, height: img.naturalHeight });
      };
    }
    return () => { cancelled = true; };
  }, [file, objectUrl, isVideo]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSend(file, caption, meta);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, caption, meta, onCancel, onSend]);

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md animate-fadeIn p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-[520px] rounded-2xl overflow-hidden bg-zinc-900/95 border border-zinc-700/70 animate-popIn"
        style={{ boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7), 0 0 40px rgba(var(--accent-rgb),0.10)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
          <div className="text-sm text-zinc-300">Отправить {isVideo ? "видео" : "фото"}</div>
          <button onClick={onCancel} aria-label="Отмена" className="text-zinc-500 hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>

        <div className="bg-zinc-950">
          {isVideo ? (
            <video src={objectUrl} controls playsInline className="w-full max-h-[60vh] object-contain bg-black" />
          ) : (
            <img src={objectUrl} alt="" className="w-full max-h-[60vh] object-contain bg-black" />
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); onSend(file, caption, meta); }}
          className="flex items-center gap-2 p-3 bg-zinc-900"
        >
          <input
            type="text"
            placeholder="Подпись (опционально)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="flex-1 bg-zinc-800/60 border border-zinc-700/60 focus:border-lime-400/60 focus:outline-none rounded-xl px-3 py-2 text-sm"
            autoFocus
          />
          <button
            type="submit"
            className="shrink-0 inline-flex items-center gap-1.5 bg-lime-400 hover:bg-lime-300 text-zinc-900 font-semibold rounded-xl px-3.5 py-2 text-sm transition-colors"
          >
            <Send size={15} />
            Отправить
          </button>
        </form>

        {meta && (
          <div className="px-4 pb-3 text-[10px] text-zinc-600 tabular-nums">
            {meta.width}×{meta.height}
            {meta.duration_ms ? ` · ${(meta.duration_ms / 1000).toFixed(1)}s` : ""}
            {` · ${(file.size / (1024 * 1024)).toFixed(1)} MB`}
          </div>
        )}
      </div>
    </div>
  );
}
