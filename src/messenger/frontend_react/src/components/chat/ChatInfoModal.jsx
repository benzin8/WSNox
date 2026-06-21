import { useCallback, useEffect, useRef, useState } from "react";
import { X, Image as ImageIcon, Play, Loader2, Search, MessageSquare, Megaphone, BadgeCheck, Link2, Crown } from "lucide-react";
import { MediaLightbox } from "./MediaLightbox";
import { GroupAvatar } from "./GroupAvatar";
import { Avatar } from "../profile/Avatar";

// Opens on a chat-header tap. One unified view: a type-aware profile/info
// section on top + the chat's media gallery + in-chat search (words + date).
// Channels render a wider grid; private/group a compact one. Search is scoped
// to this chat (word search decrypts on the fly server-side).
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
  chat, chatName, isGroup, isChannel, recipientId,
  getChatMedia, searchChatMessages, fetchUserProfile, getChatMembers,
  onOpenMembers, onJumpToMessage, onClose,
}) {
  const chatId = chat?.id;
  const isPrivate = !isGroup && !isChannel;

  // --- media gallery ---
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { type, url }
  const loadingRef = useRef(false);

  // --- identity (profile / members) ---
  const [profile, setProfile] = useState(null);
  const [members, setMembers] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // --- search ---
  const [query, setQuery] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [results, setResults] = useState([]);
  const [searchCursor, setSearchCursor] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const searchingRef = useRef(false);

  // Hook fns aren't memoized (new identity each render) — keep them in a ref.
  const fnsRef = useRef({ getChatMedia, searchChatMessages, fetchUserProfile, getChatMembers });
  useEffect(() => {
    fnsRef.current = { getChatMedia, searchChatMessages, fetchUserProfile, getChatMembers };
  });

  // Initial media load (first setState after await — no sync setState in effect).
  useEffect(() => {
    if (!chatId) return undefined;
    let cancelled = false;
    (async () => {
      const data = await fnsRef.current.getChatMedia(chatId, null);
      if (cancelled) return;
      setItems(data.items || []);
      setCursor(data.next_before_id || null);
      setDone(!data.next_before_id);
      setInitialLoading(false);
    })();
    return () => { cancelled = true; };
  }, [chatId]);

  // Identity: recipient profile (private) or members (group).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isPrivate && recipientId && fnsRef.current.fetchUserProfile) {
        const p = await fnsRef.current.fetchUserProfile(recipientId);
        if (!cancelled) setProfile(p || null);
      } else if (isGroup && chatId && fnsRef.current.getChatMembers) {
        const m = await fnsRef.current.getChatMembers(chatId);
        if (!cancelled) setMembers(m || []);
      }
    })();
    return () => { cancelled = true; };
  }, [chatId, isPrivate, isGroup, recipientId]);

  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done || !chatId || !cursor) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const data = await fnsRef.current.getChatMedia(chatId, cursor);
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
    const data = await fnsRef.current.searchChatMessages(chatId, args);
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

  const copyInvite = () => {
    const token = chat?.invite_token;
    if (!token) return;
    navigator.clipboard?.writeText(`${window.location.origin}/join/${token}`);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2500);
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

  const cols = isChannel ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4";
  const canSearch = query.trim().length > 0 || dateStr;
  const initials = (chatName || chat?.name || "?").slice(0, 1).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[88vh] bg-zinc-950 border border-zinc-800/80 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between gap-2 p-3.5 border-b border-zinc-800/60 shrink-0">
          <h2 className="font-semibold text-zinc-100 truncate px-1">{chatName || "Чат"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 shrink-0"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
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

        <div className="flex-1 min-h-0 overflow-y-auto" onScroll={onScroll}>
          {searchActive ? (
            <div className="p-1.5">
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
            </div>
          ) : (
            <>
              {/* ── identity / info ── */}
              {isChannel && (
                <div className="flex flex-col items-center text-center px-5 pt-5 pb-4 border-b border-zinc-800/50">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mb-3"
                    style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.35)' }}
                  >
                    <Megaphone size={32} style={{ color: 'var(--color-lime-400)' }} />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-1.5">
                    {chat?.name || chatName}
                    {chat?.is_official && <BadgeCheck size={16} style={{ color: 'var(--color-lime-400)' }} />}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {chat?.is_official ? "Официальный канал" : `${chat?.member_count || 0} подписчиков`}
                  </p>
                  {chat?.description && (
                    <p className="text-sm text-zinc-300 mt-3 leading-relaxed">{chat.description}</p>
                  )}
                  {chat?.is_owner && chat?.invite_token && (
                    <button
                      type="button"
                      onClick={copyInvite}
                      className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800/60 text-zinc-200 hover:bg-zinc-800 text-sm"
                    >
                      <Link2 size={15} /> {linkCopied ? "Ссылка скопирована!" : "Скопировать ссылку-приглашение"}
                    </button>
                  )}
                </div>
              )}

              {isGroup && (
                <div className="px-4 pt-5 pb-4 border-b border-zinc-800/50">
                  <div className="flex flex-col items-center text-center mb-3">
                    <GroupAvatar id={chat?.id} name={chat?.name || chatName} size={80} className="mb-3" />
                    <h3 className="text-lg font-bold text-zinc-100">{chat?.name || chatName}</h3>
                    <p className="text-sm text-zinc-500 mt-0.5">
                      {members ? `${members.length} участников` : "…"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-hide">
                    {(members || []).slice(0, 14).map((m) => (
                      <div key={m.user_id} className="flex flex-col items-center gap-1 shrink-0 w-14">
                        <div className="relative">
                          <Avatar url={m.avatar} initials={(m.display_name || m.username || "?").slice(0, 1).toUpperCase()} size={44} />
                          {m.role === "admin" && (
                            <Crown size={12} className="absolute -top-1 -right-1 text-amber-300" />
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400 truncate w-full text-center">
                          {m.display_name || m.username}
                        </span>
                      </div>
                    ))}
                  </div>
                  {onOpenMembers && (
                    <button
                      type="button"
                      onClick={onOpenMembers}
                      className="w-full mt-3 py-2 rounded-xl bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 text-sm"
                    >
                      Все участники · добавить
                    </button>
                  )}
                </div>
              )}

              {isPrivate && (
                <div className="flex flex-col items-center text-center px-5 pt-5 pb-4 border-b border-zinc-800/50">
                  <Avatar
                    url={profile?.avatar_url || chat?.recipient?.avatar_thumb_url}
                    initials={initials}
                    online={profile?.online}
                    size={88}
                    ring
                  />
                  <h3 className="text-lg font-bold text-zinc-100 mt-3">
                    {profile?.display_name || chatName}
                  </h3>
                  {profile?.username && (
                    <p className="text-sm text-zinc-500 mt-0.5">@{profile.username}</p>
                  )}
                  <span className="inline-flex items-center gap-1.5 mt-2 text-xs text-zinc-400">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: profile?.online ? "var(--color-lime-400)" : "var(--color-zinc-500)" }}
                    />
                    {profile?.online ? "в сети" : "не в сети"}
                  </span>
                  {profile?.bio && (
                    <p className="text-sm text-zinc-300 leading-relaxed mt-3">{profile.bio}</p>
                  )}
                </div>
              )}

              {/* ── media ── */}
              <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-zinc-600">Медиа</div>
              <div className="p-1.5 pt-0">
                {initialLoading && (
                  <div className="h-40 flex items-center justify-center">
                    <Loader2 size={22} className="text-lime-400 animate-spin" />
                  </div>
                )}
                {!initialLoading && items.length === 0 && (
                  <div className="h-32 flex flex-col items-center justify-center text-center text-zinc-500">
                    <ImageIcon size={24} className="text-zinc-700 mb-2" />
                    <p className="text-sm">Пока нет медиа</p>
                  </div>
                )}
                <div className={`grid ${cols} gap-1.5`}>
                  {items.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setLightbox({ type: m.msg_type, url: m.attachment_url })}
                      style={{ aspectRatio: "1 / 1" }}
                      className="relative rounded-lg overflow-hidden bg-zinc-900 group"
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
              </div>
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
