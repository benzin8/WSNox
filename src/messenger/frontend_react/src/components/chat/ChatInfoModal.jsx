import { useCallback, useEffect, useRef, useState } from "react";
import { X, Image as ImageIcon, Play, Info, Loader2, Search, MessageSquare } from "lucide-react";
import { MediaLightbox } from "./MediaLightbox";

// Opens on a chat-header tap: media gallery + in-chat search (words + date).
// Channels get a wider grid; private/group get a compact one. Search is scoped
// to this chat; word search runs on the server (decrypt-on-the-fly).
function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function previewText(m) {
  if (m.text) return m.text;
  if (m.msg_type === "image") return "Фото";
  if (m.msg_type === "video") return "Видео";
  if (m.msg_type === "voice") return "Голосовое";
  return "";
}

export function ChatInfoModal({
  chat, chatName, isGroup, isChannel, onOpenInfo, onClose, getChatMedia, searchChatMessages, onJumpToMessage,
}) {
  // --- media gallery ---
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { type, url }
  const loadingRef = useRef(false);

  // --- search ---
  const [query, setQuery] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [results, setResults] = useState([]);
  const [searchCursor, setSearchCursor] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const searchingRef = useRef(false);

  // Hook fns aren't memoized (new identity each render) — keep in refs.
  const getMediaRef = useRef(getChatMedia);
  const searchRef = useRef(searchChatMessages);
  useEffect(() => { getMediaRef.current = getChatMedia; searchRef.current = searchChatMessages; });
  const chatId = chat?.id;

  // Initial media load — first setState after the await (no sync setState in effect).
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

  const runSearch = useCallback(async (before) => {
    const q = query.trim();
    if ((!q && !dateStr) || searchingRef.current || !chatId) return;
    searchingRef.current = true;
    setSearchActive(true);
    setSearching(true);
    if (!before) { setResults([]); setSearchDone(false); }
    const args = { beforeId: before || undefined };
    if (q) args.q = q;
    if (dateStr) { args.dateFrom = `${dateStr}T00:00:00`; args.dateTo = `${dateStr}T23:59:59`; }
    const data = await searchRef.current(chatId, args);
    setResults((prev) => (before ? [...prev, ...(data.items || [])] : data.items || []));
    setSearchCursor(data.next_before_id || null);
    if (!data.next_before_id) setSearchDone(true);
    setSearching(false);
    searchingRef.current = false;
  }, [query, dateStr, chatId]);

  const clearSearch = () => {
    setSearchActive(false);
    setQuery("");
    setDateStr("");
    setResults([]);
    setSearchCursor(null);
    setSearchDone(false);
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight >= 320) return;
    if (searchActive) {
      if (!searchDone && searchCursor) runSearch(searchCursor);
    } else {
      loadMore();
    }
  };

  const cols = isChannel ? "grid-cols-2" : "grid-cols-3";
  const canSearch = query.trim().length > 0 || dateStr;

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
            <p className="text-xs text-zinc-500">{isChannel ? "Медиа и поиск" : "Медиа и поиск"}</p>
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

        {/* Search bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); runSearch(null); }}
          className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800/60 shrink-0"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по словам…"
              className="w-full bg-zinc-800/40 border border-zinc-700/60 rounded-lg py-2 pl-8 pr-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-lime-400/50"
            />
          </div>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="bg-zinc-800/40 border border-zinc-700/60 rounded-lg py-2 px-2 text-xs text-zinc-300 focus:outline-none focus:border-lime-400/50"
          />
          <button
            type="submit"
            disabled={!canSearch}
            className="shrink-0 px-3 py-2 rounded-lg bg-lime-400 text-zinc-900 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Найти
          </button>
          {searchActive && (
            <button
              type="button"
              onClick={clearSearch}
              className="shrink-0 p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              aria-label="Сбросить поиск"
            >
              <X size={16} />
            </button>
          )}
        </form>

        <div className="flex-1 min-h-0 overflow-y-auto p-1.5" onScroll={onScroll}>
          {searchActive ? (
            <>
              {!searching && results.length === 0 && (
                <div className="h-40 flex items-center justify-center text-sm text-zinc-500">
                  Ничего не найдено
                </div>
              )}
              <div className="space-y-1">
                {results.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onJumpToMessage?.(m.id)}
                    className="w-full text-left flex gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-colors"
                  >
                    {(m.msg_type === "image" || m.msg_type === "video") && (m.attachment_thumb_url || m.attachment_url) ? (
                      <img
                        src={m.attachment_thumb_url || m.attachment_url}
                        alt=""
                        loading="lazy"
                        className="w-12 h-12 rounded-lg object-cover shrink-0 bg-zinc-900"
                      />
                    ) : (
                      <span className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                        <MessageSquare size={18} className="text-zinc-600" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-zinc-200 line-clamp-2 break-words">{previewText(m)}</span>
                      <span className="block text-[11px] text-zinc-500 mt-0.5">{formatWhen(m.created_at)}</span>
                    </span>
                  </button>
                ))}
              </div>
              {searching && (
                <div className="flex justify-center py-4">
                  <Loader2 size={20} className="text-lime-400 animate-spin" />
                </div>
              )}
            </>
          ) : (
            <>
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
                      className="absolute inset-0 w-full h-full object-cover group-hover:opacity-90 transition-opacity"
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
            </>
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
