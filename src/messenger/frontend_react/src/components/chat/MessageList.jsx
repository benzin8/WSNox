import React from "react";
import { MessageSquare } from "lucide-react";

export const MessageList = ({messages, messagesEndRef}) => {
    return (
        <div className="flex-grow overflow-y-auto p-6 space-y-4 scrollbar-hide">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
              <MessageSquare size={48} className="mb-4 text-lime-400" />
              <p>Нет сообщений. Начните разговор!</p>
            </div>
          )}
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex w-full ${msg.type === 'outgoing' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm shadow-sm ${
                  msg.type === 'outgoing' 
                  ? 'bg-lime-400 text-zinc-900 font-medium rounded-tr-none' 
                  : 'bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
    )
}