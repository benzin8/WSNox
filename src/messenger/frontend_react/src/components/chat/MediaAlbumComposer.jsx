import React from "react";
import { X, ArrowLeft, ArrowRight, Send } from "lucide-react";
import { removeAt, move } from "./albumComposer.js";

const ALBUM_MAX = 10;

/**
 * Review tray for a multi-photo album. Shows thumbnails, lets the user remove
 * and reorder, takes one caption, then emits the ordered File[] + caption.
 *
 * Object URLs are created once per file and travel with the file through
 * reorders (no churn); they're revoked on remove and on unmount.
 *
 * Props: files (File[]), onClose(), onSend(orderedFiles, caption)
 */
export function MediaAlbumComposer({ files: initialFiles, onClose, onSend }) {
  const [items, setItems] = React.useState(() =>
    initialFiles.slice(0, ALBUM_MAX).map((file) => ({ file, url: URL.createObjectURL(file) })),
  );
  const [caption, setCaption] = React.useState("");

  // Keep a live handle on items so the unmount cleanup revokes whatever remains
  // without re-running on every change (ref written in an effect, never render).
  const itemsRef = React.useRef(items);
  React.useEffect(() => { itemsRef.current = items; }, [items]);
  React.useEffect(() => () => {
    itemsRef.current.forEach((it) => { try { URL.revokeObjectURL(it.url); } catch { /* noop */ } });
  }, []);

  const remove = (i) => {
    setItems((prev) => {
      const gone = prev[i];
      if (gone) { try { URL.revokeObjectURL(gone.url); } catch { /* noop */ } }
      return removeAt(prev, i);
    });
  };

  const send = () => {
    if (items.length < 1) return;
    onSend(items.map((it) => it.file), caption);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-zinc-100">Альбом · {items.length} фото</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto">
          {items.map((it, i) => (
            <div key={it.url} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800">
              <img src={it.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="Убрать фото"
              >
                <X size={14} />
              </button>
              <div className="absolute bottom-1 left-1 right-1 flex justify-between">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => setItems((prev) => move(prev, i, i - 1))}
                  className="w-6 h-6 grid place-items-center rounded-full bg-black/60 text-white disabled:opacity-30"
                  aria-label="Левее"
                >
                  <ArrowLeft size={12} />
                </button>
                <button
                  type="button"
                  disabled={i === items.length - 1}
                  onClick={() => setItems((prev) => move(prev, i, i + 1))}
                  className="w-6 h-6 grid place-items-center rounded-full bg-black/60 text-white disabled:opacity-30"
                  aria-label="Правее"
                >
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Подпись к альбому…"
          className="w-full mt-3 bg-zinc-800/60 rounded-xl px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-lime-400/40"
        />

        <button
          type="button"
          disabled={items.length < 1}
          onClick={send}
          className="w-full mt-3 py-2.5 rounded-xl bg-lime-400 text-zinc-900 font-semibold hover:bg-lime-300 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Send size={16} /> Отправить
        </button>
      </div>
    </div>
  );
}
