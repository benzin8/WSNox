import React, { useMemo } from "react";
import { MessageSquare } from "lucide-react";

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

function DateSeparator({ label }) {
    return (
        <div className="flex items-center justify-center my-4">
            <div className="px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-zinc-400 text-xs font-medium backdrop-blur-sm">
                {label}
            </div>
        </div>
    );
}

export const MessageList = ({ messages, messagesEndRef }) => {
    const itemsWithSeparators = useMemo(
        () => messages.map((msg, idx) => {
            const dateKey = getDateKey(msg.created_at);
            const prevDateKey = idx > 0 ? getDateKey(messages[idx - 1].created_at) : null;
            const showDateSep = !!(dateKey && dateKey !== prevDateKey);
            return { msg, showDateSep };
        }),
        [messages],
    );

    return (
        <div className="flex-grow min-h-0 overflow-y-auto scrollbar-hide">
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-1">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40 min-h-[60vh]">
                <MessageSquare size={48} className="mb-4 text-lime-400" />
                <p>Нет сообщений. Начните разговор!</p>
              </div>
            )}
            {itemsWithSeparators.map(({ msg, showDateSep }) => {
              const isOut = msg.type === 'outgoing';
              const time = formatTime(msg.created_at);
              return (
                <React.Fragment key={msg.id}>
                  {showDateSep && (
                    <DateSeparator label={formatDateLabel(msg.created_at)} />
                  )}
                  <div
                    className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                  >
                    <div
                      className={`max-w-[75%] px-3.5 py-2 text-sm leading-relaxed shadow-md ${
                        isOut
                        ? 'bg-lime-400 text-zinc-900 font-medium rounded-2xl rounded-br-sm'
                        : 'bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm border border-zinc-700/60'
                      }`}
                    >
                      <div className="flex items-end gap-2">
                        <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                        <span className="flex items-center gap-1 shrink-0 self-end mb-0.5">
                          {time && (
                            <span className={`text-[10px] leading-none select-none ${
                              isOut ? 'text-zinc-700/70' : 'text-zinc-500'
                            }`}>
                              {time}
                            </span>
                          )}
                          {isOut && (
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full ${
                                msg.read_at ? 'bg-lime-400' : 'bg-zinc-500'
                              }`}
                              title={msg.read_at ? 'Прочитано' : 'Доставлено'}
                            />
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>
    );
};
