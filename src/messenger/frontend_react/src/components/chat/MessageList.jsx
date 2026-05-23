import React from "react";
import { MessageSquare } from "lucide-react";

function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const MessageList = ({messages, messagesEndRef}) => {
    return (
        <div className="flex-grow min-h-0 overflow-y-auto p-6 space-y-4 scrollbar-hide">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
              <MessageSquare size={48} className="mb-4 text-lime-400" />
              <p>Нет сообщений. Начните разговор!</p>
            </div>
          )}
          {messages.map((msg) => {
            const isOut = msg.type === 'outgoing';
            const time = formatTime(msg.created_at);
            return (
              <div
                key={msg.id}
                className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm shadow-sm ${
                    isOut
                    ? 'bg-lime-400 text-zinc-900 font-medium rounded-tr-none'
                    : 'bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700'
                  }`}
                >
                  <div className="flex items-end gap-2">
                    <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                    {time && (
                      <span className={`text-[10px] leading-none shrink-0 self-end mb-0.5 ${
                        isOut ? 'text-zinc-700' : 'text-zinc-500'
                      }`}>
                        {time}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
    )
}
