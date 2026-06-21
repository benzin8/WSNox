import { useCallback, useEffect, useRef, useState } from "react";
import { X, Image as ImageIcon, Play, Info, Loader2 } from "lucide-react";
import { MediaLightbox } from "./MediaLightbox";

// Opens on a chat-header tap. Shows the chat's media gallery (all photos /
// videos) with infinite scroll; search lands here in a later slice. Channels
// get a wider "magazine" grid; private/group get a compact one.
export function ChatInfoModal({ chat, chatName, isGroup, isChannel, onOpenInfo, onClose, getChatMedia }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { type, url }
  const loadingRef = useRef(false);
  // getChatMedia isn't memoized by the hook (new identity each render); keep it
  // in a ref so the load effect doesn't re-fire every render.
  const getMediaRef = useRef(getChatMedia);
  useEffect(() => { getMediaRef.current = getChatMedia; });
  const chatId = chat?.id;

  // Initial load. The first setState happens AFTER the await so it doesn't run
  // synchronously inside the effect (matches the rest of the codebase).
  useEffect(() => {
    if (!chatId) return undefined;
    let cancelled = false;
    (async () => {
      const data = await getMediaRef.current(chatId, null);
      if (cancelled) return;
      setItems(data.items || []);
      setCursor(data.next_before_id || null);
      setDone(!data.next_before_id);
      setInitialLoading(false);
    })();
    return () => { cancelled = true; };
  }, [chatId]);

  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // Pagination — called from the scroll handler (an event handler, so the
  // synchronous setState here is fine).
  const loadMore = useCallback(async () => {
    if (loadingRef.current || done || !chatId || !cursor) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const data = await getMediaRef.current(chatId, cursor);
    setItems((prev) => [...prev, ...(data.items || [])]);
    setCursor(data.next_before_id || null);
    if (!data.next_before_id) setDone(true);
    setLoadingMore(false);
    loadingRef.current = false;
  }, [chatId, cursor, done]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 320) loadMore();
  };

  const cols = isChannel ? "grid-cols-2" : "grid-cols-3";

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[88vh] bg-zinc-950 border border-zinc-800/80 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between gap-2 p-4 border-b border-zinc-800/60 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-zinc-100 truncate">{chatName || "Чат"}</h2>
            <p className="text-xs text-zinc-500">{isChannel ? "Медиа канала" : "Медиа чата"}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onOpenInfo && (
              <button
                type="button"
                onClick={onOpenInfo}
                className="px-2.5 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 flex items-center gap-1.5"
              >
                <Info size={15} /> {isGroup ? "Участники" : "Профиль"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              aria-label="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-1.5" onScroll={onScroll}>
          {initialLoading && (
            <div className="h-48 flex items-center justify-center">
              <Loader2 size={22} className="text-lime-400 animate-spin" />
            </div>
          )}

          {!initialLoading && items.length === 0 && (
            <div className="h-48 flex flex-col items-center justify-center text-center text-zinc-500">
              <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
                <ImageIcon size={26} className="text-zinc-600" />
              </div>
              <p className="text-sm">Пока нет медиа</p>
            </div>
          )}

          <div className={`grid ${cols} gap-1.5`}>
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setLightbox({ type: m.msg_type, url: m.attachment_url })}
                className="relative aspect-square rounded-lg overflow-hidden bg-zinc-900 group"
              >
                <img
                  src={m.attachment_thumb_url || m.attachment_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                />
                {m.msg_type === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <span className="w-8 h-8 rounded-full bg-black/55 flex items-center justify-center">
                      <Play size={16} className="text-white translate-x-[1px]" fill="currentColor" />
                    </span>
                  </span>
                )}
              </button>
            ))}
          </div>

          {loadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 size={20} className="text-lime-400 animate-spin" />
            </div>
          )}
        </div>
      </div>

      <MediaLightbox
        open={!!lightbox}
        type={lightbox?.type}
        url={lightbox?.url}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
