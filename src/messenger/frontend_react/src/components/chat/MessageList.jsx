import React, { useMemo, useState, useRef, useCallback } from "react";
import { MessageSquare, Reply } from "lucide-react";
import { MessageActionMenu } from "./MessageActionMenu";
import { MediaMessage } from "./MediaMessage";
import { MessageStatus } from "./MessageStatus";

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

// Individual message bubble with swipe + click handlers
const MessageBubble = ({ msg, isOut, onReply, onActionMenu, onRetry, gap = 0 }) => {
    const time = formatTime(msg.created_at);
    const touchRef = useRef(null);
    const [swipeX, setSwipeX] = useState(0);

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

    return (
        <div
            className={`flex w-full ${isOut ? "justify-end" : "justify-start"} animate-fadeIn`}
            style={gap > 0 ? { marginTop: `${gap}px` } : undefined}
        >
            <div className="relative flex items-center gap-2" style={{ maxWidth: "75%" }}>
                {/* Reply indicator (appears on swipe) */}
                <div
                    className="absolute -left-8 flex items-center justify-center transition-opacity"
                    style={{ opacity: swipeProgress }}
                >
                    <Reply size={18} className="text-lime-400" />
                </div>

                <div
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={`text-sm leading-relaxed shadow-md cursor-pointer select-none transition-transform ${
                        msg.msg_type === "image" || msg.msg_type === "video"
                            ? "p-1"
                            : "px-3.5 py-2"
                    } ${
                        isOut
                            ? "bg-lime-400 text-zinc-900 font-medium rounded-2xl rounded-br-sm"
                            : "bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm border border-zinc-700/60"
                    }`}
                    style={{
                        transform: swipeX > 0 ? `translateX(${swipeX}px)` : undefined,
                        transition: swipeX > 0 ? "none" : "transform 200ms ease-out",
                    }}
                >
                    {/* Reply quote if this message is a reply */}
                    {msg.reply_to_id && msg.reply_to_text && (
                        <div
                            className={`mb-1.5 mx-1 px-2 py-1 rounded-lg text-xs border-l-2 ${
                                isOut
                                    ? "bg-lime-500/30 border-zinc-700 text-zinc-800"
                                    : "bg-zinc-700/50 border-lime-400 text-zinc-400"
                            }`}
                        >
                            <span className="line-clamp-1">{truncate(msg.reply_to_text)}</span>
                        </div>
                    )}

                    {(msg.msg_type === "image" || msg.msg_type === "video") && (
                        <MediaMessage
                            type={msg.msg_type}
                            fullUrl={msg.attachment_url}
                            thumbUrl={msg.attachment_thumb_url}
                            meta={msg.attachment_meta}
                            isUploading={msg.client_status === "uploading" || msg.client_status === "pending"}
                        />
                    )}

                    <div className={`flex items-end gap-2 ${msg.msg_type === "image" || msg.msg_type === "video" ? "px-2 pt-1 pb-0.5" : ""}`}>
                        {msg.text && (
                            <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                        )}
                        <span className={`flex items-center gap-1 shrink-0 self-end mb-0.5 ${msg.text ? "" : "ml-auto"}`}>
                            {msg.edited_at && (
                                <span className={`text-[10px] leading-none select-none ${
                                    isOut ? "text-zinc-700/60" : "text-zinc-500/70"
                                }`}>
                                    ред.
                                </span>
                            )}
                            {time && (
                                <span className={`text-[10px] leading-none select-none ${
                                    isOut ? "text-zinc-700/70" : "text-zinc-500"
                                }`}>
                                    {time}
                                </span>
                            )}
                            {isOut && (
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
                </div>
            </div>
        </div>
    );
};

export const MessageList = ({ messages, messagesEndRef, onReply, onDeleteMessage, onEditMessage, onRetryMedia }) => {
    const [actionMsg, setActionMsg] = useState(null);

    const itemsWithSeparators = useMemo(
        () => messages.map((msg, idx) => {
            const dateKey = getDateKey(msg.created_at);
            const prevDateKey = idx > 0 ? getDateKey(messages[idx - 1].created_at) : null;
            const showDateSep = !!(dateKey && dateKey !== prevDateKey);
            const prev = idx > 0 ? messages[idx - 1] : null;
            const gap = showDateSep ? 0 : getMessageGap(prev, msg);
            return { msg, showDateSep, gap };
        }),
        [messages],
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
            {itemsWithSeparators.map(({ msg, showDateSep, gap }) => {
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
                    onRetry={onRetryMedia}
                    gap={gap}
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
              onClose={() => setActionMsg(null)}
            />
          )}
        </div>
    );
};
