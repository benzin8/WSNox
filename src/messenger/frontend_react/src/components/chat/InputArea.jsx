import React from "react";
import { useState } from "react";
import { Send, X, Reply, Pencil, Check, Smile } from "lucide-react";
import { AttachmentPicker } from "./AttachmentPicker";
import { VoiceRecorder } from "./VoiceRecorder";
import { useTheme } from "../../features/theme";

// Full emoji picker — lazy so it stays out of the main bundle until opened.
const EmojiPicker = React.lazy(() => import("emoji-picker-react"));

// Composer grows with its content up to this height, then scrolls.
const MAX_COMPOSER_H = 160;

export const InputArea = ({ sendMessage, isConnected, replyTo, onCancelReply, editingMessage, onCancelEdit, onConfirmEdit, onPickMedia, onPickMany, onPickFile, onSendVoice, onType }) => {
    const [inputText, setInputText] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const inputRef = React.useRef(null);
    const emojiWrapRef = React.useRef(null);
    const emojiBtnRef = React.useRef(null);
    const { theme } = useTheme();

    // When entering edit mode, populate input with existing message text
    React.useEffect(() => {
      if (editingMessage) {
        setInputText(editingMessage.text || "");
        inputRef.current?.focus();
      }
    }, [editingMessage]);

    // Close the emoji picker on outside click / Escape.
    React.useEffect(() => {
      if (!showEmoji) return undefined;
      const onDown = (e) => {
        if (
          !emojiWrapRef.current?.contains(e.target) &&
          !emojiBtnRef.current?.contains(e.target)
        ) setShowEmoji(false);
      };
      const onKey = (e) => { if (e.key === "Escape") setShowEmoji(false); };
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [showEmoji]);

    const insertEmoji = (emoji) => {
      const el = inputRef.current;
      const start = el?.selectionStart ?? inputText.length;
      const end = el?.selectionEnd ?? inputText.length;
      setInputText((t) => t.slice(0, start) + emoji + t.slice(end));
      requestAnimationFrame(() => {
        el?.focus();
        const pos = start + emoji.length;
        try { el?.setSelectionRange(pos, pos); } catch { /* input may be unmounted */ }
      });
    };

    const handleSubmit = (e) => {
      e.preventDefault();
      setShowEmoji(false);
      if (!inputText.trim() || !isConnected) return;

      if (editingMessage) {
        onConfirmEdit?.(editingMessage, inputText);
        setInputText("");
        return;
      }

      sendMessage(inputText, replyTo);
      setInputText("");
      onCancelReply?.();
    };

    // Enter sends; Shift+Enter inserts a newline. isComposing guards IME input,
    // where Enter commits the candidate rather than ending the message.
    const handleKeyDown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit(e);
      }
    };

    const handleCancelEdit = () => {
      onCancelEdit?.();
      setInputText("");
    };

    // Re-measure on every value change: typing, pasting, emoji insert, and the
    // edit-mode prefill all need the box to resize.
    React.useLayoutEffect(() => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_H)}px`;
    }, [inputText]);

    // Focus input when replying
    React.useEffect(() => {
      if (replyTo) inputRef.current?.focus();
    }, [replyTo]);

    return (
        <div className="relative p-3 sm:p-6 bg-zinc-950/50 border-t border-zinc-800/80">
          {/* Edit preview bar */}
          {editingMessage && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-zinc-800/80 border border-lime-400/30 rounded-xl animate-fadeIn">
              <Pencil size={14} className="text-lime-400 shrink-0" />
              <div className="flex-1 min-w-0 text-xs text-zinc-400 truncate border-l-2 border-lime-400 pl-2">
                {editingMessage.text}
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {/* Reply preview bar */}
          {replyTo && !editingMessage && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-zinc-800/80 border border-zinc-700/50 rounded-xl animate-fadeIn">
              <Reply size={14} className="text-lime-400 shrink-0" />
              <div className="flex-1 min-w-0 text-xs text-zinc-400 truncate border-l-2 border-lime-400 pl-2">
                {replyTo.text}
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Emoji picker popover */}
          {showEmoji && (
            <div
              ref={emojiWrapRef}
              className="absolute bottom-full right-4 mb-2 z-50 animate-fadeIn shadow-2xl rounded-2xl overflow-hidden"
            >
              <React.Suspense
                fallback={
                  <div className="w-[300px] h-[120px] flex items-center justify-center bg-zinc-900 text-zinc-500 text-sm">
                    Загрузка эмодзи…
                  </div>
                }
              >
                <EmojiPicker
                  onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
                  theme={theme === "light" ? "light" : "dark"}
                  width={Math.min(340, typeof window !== "undefined" ? window.innerWidth - 32 : 340)}
                  height={400}
                  lazyLoadEmojis
                  searchPlaceHolder="Поиск"
                  previewConfig={{ showPreview: false }}
                />
              </React.Suspense>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={`flex items-end gap-2 bg-zinc-800/30 rounded-2xl p-2 pl-2 border transition-all duration-300 ${
              editingMessage
                ? "border-lime-400/50 ring-4 ring-lime-400/20"
                : "border-zinc-700/60 focus-within:border-lime-400/50 focus-within:ring-4 focus-within:ring-lime-400/40"
            }`}
          >
            {!editingMessage && onPickMedia && (
              <AttachmentPicker onPick={onPickMedia} onPickMany={onPickMany} onPickFile={onPickFile} disabled={!isConnected} />
            )}
            {/* A textarea, not <input type="text">: the input value sanitizer
                strips CR/LF, so pasted multi-line snippets lost their line
                breaks and indentation before React ever saw them. */}
            <textarea
              ref={inputRef}
              rows={1}
              placeholder={editingMessage ? "Редактирование…" : "Напишите сообщение…"}
              // min-w-0 is critical: a flex child otherwise keeps its ~180px
              // intrinsic width and pushes the trailing send/voice buttons off
              // the bar (and off-screen) on narrow phones.
              className="flex-grow min-w-0 bg-transparent border-none focus:outline-none text-base md:text-sm py-2 resize-none overflow-y-auto leading-relaxed"
              value={inputText}
              onChange={(e) => { setInputText(e.target.value); onType?.(); }}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              ref={emojiBtnRef}
              onClick={() => { setShowEmoji((v) => !v); }}
              aria-label="Эмодзи"
              className={`shrink-0 p-2 rounded-xl transition-colors ${
                showEmoji ? "text-lime-400" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Smile size={20} />
            </button>
            {/* Mic when there's nothing to send (and not editing); otherwise the
                send/confirm button. The voice recorder uploads via onSendVoice. */}
            {!editingMessage && onSendVoice && !inputText.trim() ? (
              <VoiceRecorder onRecorded={onSendVoice} disabled={!isConnected} />
            ) : (
              <button
                type="submit"
                disabled={!inputText.trim() || !isConnected}
                className="p-3 rounded-xl transition-all duration-300 active:scale-[0.97] disabled:grayscale disabled:opacity-50 bg-lime-400 text-zinc-900 hover:bg-lime-300 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.25)]"
              >
                {editingMessage ? <Check size={18} /> : <Send size={18} />}
              </button>
            )}
          </form>
        </div>
    );
};
