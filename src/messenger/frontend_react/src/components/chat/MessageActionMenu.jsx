import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Reply, Trash2, Copy, Pencil } from "lucide-react";

export const MessageActionMenu = ({ message, isOut, onReply, onDelete, onCopy, onEdit, onClose }) => {
  const overlayRef = useRef(null);
  const msgRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll while overlay is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const time = (() => {
    if (!message.created_at) return "";
    const d = new Date(message.created_at);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  })();

  // Render via portal — the chat slider in ChatPage has a CSS transform
  // which creates a containing block for fixed descendants, otherwise
  // `inset-0` snaps to the 200vw slider instead of the viewport and the
  // overlay sits off-center on mobile.
  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center animate-actionOverlayIn"
      style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", background: "rgba(0,0,0,0.6)" }}
    >
      {/* The message bubble — centered */}
      <div className="flex flex-col items-center gap-4 animate-popIn">
        <div
          ref={msgRef}
          className={`max-w-[75vw] md:max-w-md px-3.5 py-2 text-sm leading-relaxed shadow-lg ${
            isOut
              ? "bg-lime-400 text-zinc-900 font-medium rounded-2xl rounded-br-sm"
              : "bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm border border-zinc-700/60"
          }`}
        >
          <div className="flex items-end gap-2">
            <span className="whitespace-pre-wrap break-words">{message.text}</span>
            <span className="flex items-center gap-1 shrink-0 self-end mb-0.5">
              {message.edited_at && (
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
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    message.read_at ? "bg-zinc-900" : "bg-zinc-900/40"
                  }`}
                />
              )}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-[calc(100vw-2rem)]">
          <button
            onClick={() => { onReply(message); onClose(); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/30 hover:bg-zinc-800/60 border border-zinc-700/60 hover:border-zinc-600 backdrop-blur-sm rounded-xl text-zinc-100 text-sm font-medium transition-all duration-300 active:scale-[0.97]"
          >
            <Reply size={16} className="text-lime-400" />
            <span>Ответить</span>
          </button>
          <button
            onClick={() => { onCopy(message.text); onClose(); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/30 hover:bg-zinc-800/60 border border-zinc-700/60 hover:border-zinc-600 backdrop-blur-sm rounded-xl text-zinc-100 text-sm font-medium transition-all duration-300 active:scale-[0.97]"
          >
            <Copy size={16} className="text-lime-400" />
            <span>Копировать</span>
          </button>
          {isOut && (
            <button
              onClick={() => { onEdit(message); onClose(); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/30 hover:bg-zinc-800/60 border border-zinc-700/60 hover:border-zinc-600 backdrop-blur-sm rounded-xl text-zinc-100 text-sm font-medium transition-all duration-300 active:scale-[0.97]"
            >
              <Pencil size={16} className="text-lime-400" />
              <span>Изменить</span>
            </button>
          )}
          {isOut && (
            <button
              onClick={() => { onDelete(message); onClose(); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/30 hover:bg-red-900/40 border border-zinc-700/60 hover:border-red-500/40 backdrop-blur-sm rounded-xl text-zinc-100 text-sm font-medium transition-all duration-300 active:scale-[0.97]"
            >
              <Trash2 size={16} className="text-red-400" />
              <span>Удалить</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
