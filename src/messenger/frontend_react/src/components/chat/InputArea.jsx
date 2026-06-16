import React from "react";
import { useState } from "react";
import { Send, X, Reply, Pencil, Check } from "lucide-react";
import { AttachmentPicker } from "./AttachmentPicker";

export const InputArea = ({ sendMessage, isConnected, replyTo, onCancelReply, editingMessage, onCancelEdit, onConfirmEdit, onPickMedia }) => {
    const [inputText, setInputText] = useState("");
    const inputRef = React.useRef(null);

    // When entering edit mode, populate input with existing message text
    React.useEffect(() => {
      if (editingMessage) {
        setInputText(editingMessage.text || "");
        inputRef.current?.focus();
      }
    }, [editingMessage]);

    const handleSubmit = (e) => {
      e.preventDefault();
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

    const handleCancelEdit = () => {
      onCancelEdit?.();
      setInputText("");
    };

    // Focus input when replying
    React.useEffect(() => {
      if (replyTo) inputRef.current?.focus();
    }, [replyTo]);

    return (
        <div className="p-6 bg-zinc-950/50 border-t border-zinc-800/80">
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
          <form
            onSubmit={handleSubmit}
            className={`flex items-center gap-2 bg-zinc-800/30 rounded-2xl p-2 pl-2 border transition-all duration-300 ${
              editingMessage
                ? "border-lime-400/50 ring-4 ring-lime-400/20"
                : "border-zinc-700/60 focus-within:border-lime-400/50 focus-within:ring-4 focus-within:ring-lime-400/40"
            }`}
          >
            {!editingMessage && onPickMedia && (
              <AttachmentPicker onPick={onPickMedia} disabled={!isConnected} />
            )}
            <input
              ref={inputRef}
              type="text"
              placeholder={editingMessage ? "Редактирование..." : "Type your message..."}
              className="flex-grow bg-transparent border-none focus:outline-none text-base md:text-sm py-2"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || !isConnected}
              className={`p-3 rounded-xl transition-all duration-300 active:scale-[0.97] disabled:grayscale disabled:opacity-50 ${
                editingMessage
                  ? "bg-lime-400 text-zinc-900 hover:bg-lime-300 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.25)]"
                  : "bg-lime-400 text-zinc-900 hover:bg-lime-300 hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.25)]"
              }`}
            >
              {editingMessage ? <Check size={18} /> : <Send size={18} />}
            </button>
          </form>
        </div>
    );
};
