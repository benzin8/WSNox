import React, { useMemo, useState, useRef, useCallback } from "react";
import { Image as ImageIcon, MessageSquare, Mic as MicIcon, Reply, Video as VideoIcon } from "lucide-react";
import { MessageActionMenu } from "./MessageActionMenu";
import { ReactionChips } from "./ReactionChips";
import { MediaMessage } from "./MediaMessage";
import { AlbumMessage } from "./AlbumMessage";
import { FileCard } from "./FileCard";
import { VoiceMessage } from "./VoiceMessage";
import { MessageStatus } from "./MessageStatus";
import { Avatar } from "../profile/Avatar";

// Avatar column width for incoming bubbles in group chats. Bubbles with
// no rendered avatar (mid-run) reserve the same width so the bubble run
// stays vertically aligned under the avatar slot.
const GROUP_AVATAR_SIZE = 28;
const GROUP_AVATAR_GAP = 8;

// Turn http(s) URLs inside message text into clickable links. Returns the
// original string when there are no links, otherwise an array of strings and
// <a> nodes. stopPropagation keeps the tap from triggering the bubble's
// action-menu / reply handlers.
const URL_RE = /(https?:\/\/[^\s]+)/g;

function linkify(text) {
    if (!text) return text;
    const nodes = [];
    let last = 0;
    let m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text)) !== null) {
        if (m.index > last) nodes.push(text.slice(last, m.index));
        let url = m[0];
        const tm = url.match(/[.,!?)\]}>"'»]+$/); // strip trailing punctuation
        const trail = tm ? tm[0] : "";
        if (trail) url = url.slice(0, -trail.length);
        nodes.push(
            <a
                key={m.index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 break-all hover:opacity-80"
                onClick={(e) => e.stopPropagation()}
            >
                {url}
            </a>,
        );
        if (trail) nodes.push(trail);
        last = m.index + m[0].length;
    }
    if (last === 0) return text;
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

function replyQuotePreview(msg) {
    // The replied-to message may have been a media post without a caption;
    // in that case the backend returns reply_to_text="" — surface a clear
    // "Фото"/"Видео" label so the quote isn't an empty box.
    if (msg.reply_to_text) return { text: msg.reply_to_text, icon: null };
    if (msg.reply_to_msg_type === "image") return { text: "Фото", icon: "image" };
    if (msg.reply_to_msg_type === "video") return { text: "Видео", icon: "video" };
    if (msg.reply_to_msg_type === "voice") return { text: "Голосовое", icon: "voice" };
    if (msg.reply_to_msg_type === "file") return { text: "Файл", icon: null };
    return null;
}

function scrollToMessage(id) {
    if (id == null) return;
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("message-flash");
    // Force reflow so the animation restarts on repeated clicks.
    void el.offsetWidth;
    el.classList.add("message-flash");
    setTimeout(() => el.classList.remove("message-flash"), 1600);
}

function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffMs = today - msgDay;
    const diffDays = Math.round(diffMs / 86400000);

    if (diffDays === 0) return "Сегодня";
    if (diffDays === 1) return "Вчера";

    return d.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
}

function getDateKey(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMessageGap(prev, curr) {
    if (!prev) return 0;

    // Time-based gap
    const prevTime = new Date(prev.created_at).getTime();
    const currTime = new Date(curr.created_at).getTime();
    const diffMin = (currTime - prevTime) / 60000;

    let timeGap;
    if (diffMin < 1) timeGap = 2;
    else if (diffMin < 5) timeGap = 4;
    else if (diffMin < 15) timeGap = 8;
    else if (diffMin < 60) timeGap = 12;
    else timeGap = 16;

    // Sender change bonus
    const senderChanged = prev.type !== curr.type;

    return timeGap + (senderChanged ? 6 : 0);
}

function DateSeparator({ label }) {
    return (
        <div className="flex items-center justify-center my-4">
            <div className="px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-zinc-400 text-xs font-medium backdrop-blur-sm">
                {label}
            </div>
        </div>
    );
}

// Truncate reply text for preview
function truncate(text, max = 60) {
    if (!text) return "";
    return text.length > max ? text.slice(0, max) + "..." : text;
}

// Deterministic palette for the sender-name label in group chats.
const SENDER_COLOURS = [
    "text-sky-300", "text-violet-300", "text-rose-300", "text-amber-300",
    "text-emerald-300", "text-orange-300", "text-pink-300", "text-cyan-300",
];
function senderColour(senderId) {
    const n = typeof senderId === "number" ? senderId : 0;
    return SENDER_COLOURS[Math.abs(n) % SENDER_COLOURS.length];
}

// Individual message bubble with swipe + click handlers
const MessageBubble = ({
    msg,
    isOut,
    onReply,
    onActionMenu,
    onReact,
    onRetry,
    gap = 0,
    showSenderName = false,
    showSenderAvatar = false,
    reserveAvatarSlot = false,
    isChannel = false,
}) => {
    const time = formatTime(msg.created_at);
    // In a channel every post is a broadcast: render them all as wide,
    // left-aligned "channel posts" (Telegram-style) regardless of who is
    // viewing, instead of the narrow mine/theirs split used in chats.
    const isOutVisual = isChannel ? false : isOut;
    // Channels read like a magazine: full-column flat posts. Chats keep the
    // narrow mine/theirs bubbles.
    const bubbleMaxWidth = isChannel ? "100%" : "75%";
    // Media display width. The bubble is sized to this so a long caption wraps
    // under the image at the image's width instead of stretching the bubble
    // wider than the photo (which left empty space on the side). Channels show
    // wide, magazine-style media; chats keep the compact size.
    const isAlbum = !!msg._album;
    const mediaWidth = isAlbum
        ? "min(460px, 82vw)"
        : isChannel ? "min(460px, 90vw)" : "min(260px, 60vw)";
    const touchRef = useRef(null);
    const [swipeX, setSwipeX] = useState(0);

    // Aura "boost": a lime glow on the bubble whose size/brightness grow with
    // the number of people who boosted, saturating around ~20 (see spec).
    const auraCount = msg.reactions?.aura || 0;
    const auraGlow = auraCount > 0
        ? `0 0 ${Math.min(10 + auraCount * 2.2, 50)}px ${Math.min(1 + auraCount * 0.6, 14)}px rgba(163,230,53,${Math.min(0.18 + auraCount * 0.025, 0.6)})`
        : undefined;

    const isMedia = isAlbum || msg.msg_type === "image" || msg.msg_type === "video";
    const isVoice = msg.msg_type === "voice";
    const isFile = msg.msg_type === "file";
    const replyPreview = msg.reply_to_id ? replyQuotePreview(msg) : null;

    // --- Swipe to reply (horizontal swipe on message) ---
    const handleTouchStart = useCallback((e) => {
        const touch = e.touches[0];
        touchRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            startTime: Date.now(),
            locked: null,
            swiping: false,
        };
    }, []);

    const handleTouchMove = useCallback((e) => {
        if (!touchRef.current) return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchRef.current.startX;
        const dy = touch.clientY - touchRef.current.startY;

        // Direction lock after 8px
        if (!touchRef.current.locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            touchRef.current.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        }
        if (touchRef.current.locked === "v") return;

        // Only allow swipe right (reply direction)
        if (dx < 0) return;

        e.preventDefault();
        touchRef.current.swiping = true;
        const clamped = Math.min(dx, 80);
        setSwipeX(clamped);
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (!touchRef.current) return;
        const wasSwiping = touchRef.current.swiping;
        const finalX = swipeX;
        touchRef.current = null;
        setSwipeX(0);

        if (wasSwiping && finalX >= 50) {
            onReply(msg);
        }
    }, [swipeX, msg, onReply]);

    // --- Double click to reply (desktop) ---
    const lastClickRef = useRef(0);
    const clickTimerRef = useRef(null);

    const handleClick = useCallback(() => {
        const now = Date.now();
        const diff = now - lastClickRef.current;
        lastClickRef.current = now;

        if (diff < 300) {
            // Double click
            clearTimeout(clickTimerRef.current);
            onReply(msg);
        } else {
            // Single click — delayed to distinguish from double
            clickTimerRef.current = setTimeout(() => {
                onActionMenu(msg);
            }, 300);
        }
    }, [msg, onReply, onActionMenu]);

    // Swipe progress indicator opacity
    const swipeProgress = Math.min(swipeX / 50, 1);

    const senderInitial = (msg.sender_display_name || msg.sender_name || "?").slice(0, 1).toUpperCase();

    return (
        <div
            className={`flex w-full ${isOutVisual ? "justify-end" : "justify-start"} animate-fadeIn`}
            style={gap > 0 ? { marginTop: `${gap}px` } : undefined}
        >
            {/* Avatar slot for incoming group bubbles. Rendered only on the
                last bubble in a run; mid-run bubbles get a transparent
                spacer of the same width so the run stays left-aligned. */}
            {!isOutVisual && reserveAvatarSlot && (
                <div
                    className="shrink-0 self-end"
                    style={{
                        width: GROUP_AVATAR_SIZE,
                        marginRight: GROUP_AVATAR_GAP,
                        marginBottom: 2,
                    }}
                >
                    {showSenderAvatar && (
                        <Avatar
                            url={msg.sender_avatar_url}
                            initials={senderInitial}
                            size={GROUP_AVATAR_SIZE}
                        />
                    )}
                </div>
            )}
            <div className="relative flex items-center gap-2 min-w-0" style={{ maxWidth: bubbleMaxWidth }}>
                {/* Reply indicator (appears on swipe) */}
                <div
                    className="absolute -left-8 flex items-center justify-center transition-opacity"
                    style={{ opacity: swipeProgress }}
                >
                    <Reply size={18} className="text-lime-400" />
                </div>

                <div
                    id={`msg-${msg.id}`}
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={`leading-relaxed shadow-md cursor-pointer select-none transition-transform min-w-0 ${
                        isChannel ? "text-[15px]" : "text-sm"
                    } ${
                        isMedia
                            ? "p-1"
                            : isChannel
                            ? "px-4 py-3"
                            : "px-3.5 py-2"
                    } ${
                        isOutVisual
                            ? "bg-lime-400 text-zinc-900 font-medium rounded-2xl rounded-br-sm"
                            : isChannel
                            ? "bg-zinc-800/55 text-zinc-100 rounded-xl border border-zinc-700/50"
                            : "bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm border border-zinc-700/60"
                    }`}
                    style={{
                        transform: swipeX > 0 ? `translateX(${swipeX}px)` : undefined,
                        transition: swipeX > 0 ? "none" : "transform 200ms ease-out, box-shadow 300ms ease-out",
                        scrollMarginTop: "88px",
                        scrollMarginBottom: "88px",
                        boxShadow: auraGlow,
                        ...(isMedia ? { width: mediaWidth, maxWidth: "100%" } : {}),
                    }}
                >
                    {/* Group: show sender display name above the first
                        message in a run from each non-self participant. */}
                    {showSenderName && (
                        <div className={`${isMedia ? "px-2 pt-1" : ""} mb-0.5 text-xs font-semibold ${senderColour(msg.sender_id)}`}>
                            {msg.sender_display_name || msg.sender_name || `Участник #${msg.sender_id}`}
                        </div>
                    )}

                    {/* Reply quote if this message is a reply */}
                    {msg.reply_to_id && replyPreview && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); scrollToMessage(msg.reply_to_id); }}
                            className={`block w-full text-left mb-1.5 ${isMedia ? "mx-1" : ""} px-2 py-1 rounded-lg text-xs border-l-2 transition-colors ${
                                isOutVisual
                                    ? "bg-lime-500/30 border-zinc-700 text-zinc-800 hover:bg-lime-500/50"
                                    : "bg-zinc-700/50 border-lime-400 text-zinc-400 hover:bg-zinc-700/80"
                            }`}
                            title="К исходному сообщению"
                        >
                            <span className="flex items-center gap-1 line-clamp-1">
                                {replyPreview.icon === "image" && <ImageIcon size={11} className="shrink-0 opacity-70" />}
                                {replyPreview.icon === "video" && <VideoIcon size={11} className="shrink-0 opacity-70" />}
                                {replyPreview.icon === "voice" && <MicIcon size={11} className="shrink-0 opacity-70" />}
                                <span className="truncate">{truncate(replyPreview.text)}</span>
                            </span>
                        </button>
                    )}

                    {isMedia && (
                        <div className="relative">
                            {isAlbum ? (
                                <AlbumMessage photos={msg.photos} width="100%" onLongPress={() => onActionMenu(msg)} />
                            ) : (
                                <MediaMessage
                                    type={msg.msg_type}
                                    fullUrl={msg.attachment_url}
                                    thumbUrl={msg.attachment_thumb_url}
                                    meta={msg.attachment_meta}
                                    isUploading={msg.client_status === "uploading" || msg.client_status === "pending"}
                                    onDoubleTap={() => onReply(msg)}
                                    width={mediaWidth}
                                />
                            )}
                            {/* Caption-less media: float the time stamp + status as a pill
                                pinned to the bottom-right of the photo (Telegram-style). */}
                            {!msg.text && (
                                <span
                                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] leading-none text-white pointer-events-none"
                                    style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
                                >
                                    {msg.edited_at && <span className="opacity-80">ред.</span>}
                                    {time && <span>{time}</span>}
                                    {isOutVisual && (
                                        <MessageStatus
                                            status={msg.client_status}
                                            readAt={msg.read_at}
                                            progress={msg.upload_progress}
                                            onRetry={() => onRetry?.(msg)}
                                            isOutMode={false}
                                        />
                                    )}
                                </span>
                            )}
                        </div>
                    )}

                    {isVoice && (
                        <VoiceMessage
                            url={msg.attachment_url}
                            durationMs={msg.attachment_meta?.duration_ms}
                            waveform={msg.attachment_meta?.waveform}
                            isUploading={msg.client_status === "uploading" || msg.client_status === "pending"}
                            isOut={isOut}
                        />
                    )}

                    {isFile && (
                        <FileCard
                            filename={msg.attachment_meta?.filename}
                            ext={msg.attachment_meta?.ext}
                            sizeBytes={msg.attachment_meta?.size_bytes}
                            url={msg.attachment_url}
                            isUploading={msg.client_status === "uploading" || msg.client_status === "pending"}
                            progress={msg.upload_progress}
                            isOut={isOutVisual}
                        />
                    )}

                    {/* Text bubble OR media with caption — keep the timestamp on the
                        same baseline as the last text line so it sits bottom-right. */}
                    {(!isMedia || msg.text) && (
                        <div className={`flex items-end gap-2 ${isMedia ? "px-2 pt-1 pb-0.5" : ""}`}>
                            {msg.text && (
                                <span className="whitespace-pre-wrap break-words flex-1 min-w-0">{linkify(msg.text)}</span>
                            )}
                            <span className="flex items-center gap-1 shrink-0 self-end mb-0.5 ml-auto">
                                {msg.edited_at && (
                                    <span className={`text-[10px] leading-none select-none ${
                                        isOutVisual ? "text-zinc-700/60" : "text-zinc-500/70"
                                    }`}>
                                        ред.
                                    </span>
                                )}
                                {time && (
                                    <span className={`text-[10px] leading-none select-none ${
                                        isOutVisual ? "text-zinc-700/70" : "text-zinc-500"
                                    }`}>
                                        {time}
                                    </span>
                                )}
                                {isOutVisual && (
                                    <MessageStatus
                                        status={msg.client_status}
                                        readAt={msg.read_at}
                                        progress={msg.upload_progress}
                                        onRetry={() => onRetry?.(msg)}
                                        isOutMode={true}
                                    />
                                )}
                            </span>
                        </div>
                    )}

                    <ReactionChips
                        reactions={msg.reactions}
                        isOut={isOutVisual}
                        onReact={(t, e) => onReact?.(msg, t, e)}
                        className={isMedia ? "px-2 pb-1" : ""}
                    />
                </div>
            </div>
        </div>
    );
};

export const MessageList = ({ messages, messagesEndRef, onReply, onReact, onDeleteMessage, onEditMessage, onRetryMedia, isGroup = false, isChannel = false }) => {
    const [actionMsg, setActionMsg] = useState(null);

    // Collapse runs of same-album, same-direction, adjacent messages into one
    // synthetic album item so the bubble renders them as a single collage.
    const grouped = useMemo(() => {
        const out = [];
        let i = 0;
        while (i < messages.length) {
            const m = messages[i];
            if (m.album_id) {
                const run = [];
                while (
                    i < messages.length
                    && messages[i].album_id === m.album_id
                    && messages[i].type === m.type
                ) {
                    run.push(messages[i]);
                    i += 1;
                }
                run.sort((a, b) => (a.attachment_meta?.album_index ?? 0) - (b.attachment_meta?.album_index ?? 0));
                const head = run[0];
                const captionMsg = run.find((p) => (p.attachment_meta?.album_index ?? 0) === 0) || head;
                out.push({
                    ...head,
                    _album: true,
                    text: captionMsg.text || "",
                    photos: run.map((p) => ({
                        id: p.id,
                        url: p.attachment_url,
                        thumbUrl: p.attachment_thumb_url,
                        progress: p.upload_progress,
                        status: p.client_status,
                    })),
                });
            } else {
                out.push(m);
                i += 1;
            }
        }
        return out;
    }, [messages]);

    const itemsWithSeparators = useMemo(
        () => grouped.map((msg, idx) => {
            const dateKey = getDateKey(msg.created_at);
            const prevDateKey = idx > 0 ? getDateKey(grouped[idx - 1].created_at) : null;
            const showDateSep = !!(dateKey && dateKey !== prevDateKey);
            const prev = idx > 0 ? grouped[idx - 1] : null;
            const next = idx < grouped.length - 1 ? grouped[idx + 1] : null;
            const nextDateKey = next ? getDateKey(next.created_at) : null;
            const gap = showDateSep ? 0 : getMessageGap(prev, msg);
            // Show the sender label above the first message in any run of
            // messages from one other participant in a group chat. Same
            // sender consecutively → don't repeat. Separator resets the run.
            const showSenderName =
                isGroup &&
                msg.type === "incoming" &&
                (showDateSep || !prev || prev.sender_id !== msg.sender_id || prev.type !== "incoming");
            // Avatar sits next to the LAST bubble in a sender run (Telegram-
            // style anchor). Date separator after this bubble also counts
            // as the end of a run.
            const isLastInRun =
                !next
                || next.sender_id !== msg.sender_id
                || next.type !== "incoming"
                || (nextDateKey && nextDateKey !== dateKey);
            const showSenderAvatar =
                isGroup && msg.type === "incoming" && isLastInRun;
            const reserveAvatarSlot = isGroup && msg.type === "incoming";
            return { msg, showDateSep, gap, showSenderName, showSenderAvatar, reserveAvatarSlot };
        }),
        [grouped, isGroup],
    );

    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);

    const showToast = useCallback((text) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast(text);
        toastTimerRef.current = setTimeout(() => setToast(null), 2000);
    }, []);

    const handleCopy = useCallback((text) => {
        navigator.clipboard?.writeText(text);
        showToast("Скопировано");
    }, [showToast]);

    const handleReply = useCallback((msg) => {
        onReply?.(msg);
    }, [onReply]);

    const handleDelete = useCallback((msg) => {
        onDeleteMessage?.(msg);
        showToast("Удалено");
    }, [onDeleteMessage, showToast]);

    const handleEdit = useCallback((msg) => {
        onEditMessage?.(msg);
    }, [onEditMessage]);

    const handleActionMenu = useCallback((msg) => {
        setActionMsg(msg);
    }, []);

    return (
        <div className="flex-grow min-h-0 overflow-y-auto scrollbar-hide">
          <div className="max-w-2xl mx-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 min-h-[60vh]">
                <div className="w-16 h-16 rounded-full bg-lime-400/10 border border-lime-400/20 flex items-center justify-center mb-4">
                  <MessageSquare size={32} className="text-lime-400" />
                </div>
                <p className="font-medium text-zinc-300">Нет сообщений</p>
                <p className="text-sm text-zinc-500 mt-1">Начните разговор!</p>
              </div>
            )}
            {itemsWithSeparators.map(({ msg, showDateSep, gap, showSenderName, showSenderAvatar, reserveAvatarSlot }) => {
              const isOut = msg.type === "outgoing";
              return (
                <React.Fragment key={msg.id}>
                  {showDateSep && (
                    <DateSeparator label={formatDateLabel(msg.created_at)} />
                  )}
                  <MessageBubble
                    msg={msg}
                    isOut={isOut}
                    onReply={handleReply}
                    onActionMenu={handleActionMenu}
                    onReact={onReact}
                    onRetry={onRetryMedia}
                    gap={gap}
                    showSenderName={showSenderName}
                    showSenderAvatar={showSenderAvatar}
                    reserveAvatarSlot={reserveAvatarSlot}
                    isChannel={isChannel}
                  />
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Toast notification */}
          {toast && (
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-fadeIn">
              <div className="px-4 py-2 bg-zinc-800/90 border border-zinc-700/60 rounded-xl text-zinc-100 text-sm font-medium backdrop-blur-sm shadow-lg">
                {toast}
              </div>
            </div>
          )}

          {/* Action overlay */}
          {actionMsg && (
            <MessageActionMenu
              message={actionMsg}
              isOut={actionMsg.type === "outgoing"}
              onReply={handleReply}
              onDelete={handleDelete}
              onCopy={handleCopy}
              onEdit={handleEdit}
              onReact={onReact}
              onClose={() => setActionMsg(null)}
            />
          )}
        </div>
    );
};
