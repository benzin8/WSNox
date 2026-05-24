import React from "react";
import { User, Phone, MoreVertical, ChevronLeft, BellOff } from 'lucide-react';
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
import { ChatMuteToggle } from "../../features/notifications";

export const ChatWindow = ({
    messages, setMessages, activeChat, sendMessage,
    isConnected, messagesEndRef, inputText, setInputText,
    chatName, onOpenProfile, onBack,
    isPartnerOnline, partnerPresencePreference,
    replyTo, onReply, onCancelReply, onDeleteMessage,
}) => {
    if (!activeChat) {
        return (
            <div className="flex-grow flex items-center justify-center bg-zinc-900 text-zinc-500">
                Выберите чат, чтобы начать общение
            </div>
        );
    }
    return (
      <div className="flex-grow flex flex-col min-h-0 bg-zinc-900 shadow-2xl">
        {/* Chat Header */}
        <header className="h-20 flex-shrink-0 border-b border-zinc-800/80 flex items-center justify-between px-6 bg-zinc-900/90 backdrop-blur-md">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => onBack?.()}
              className="md:hidden text-zinc-400 hover:text-lime-400 transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={onOpenProfile}
              className="group flex items-center gap-3 -mx-2 px-2 py-1 rounded-xl hover:bg-zinc-800/50 active:scale-[0.98] transition-all min-w-0"
              title="Открыть профиль"
            >
              <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center group-hover:border-lime-400/60 transition-colors shrink-0">
                <User size={22} className="text-lime-400" />
              </div>
              <div className="text-left min-w-0">
                <h3 className="font-bold leading-tight group-hover:text-lime-400 transition-colors truncate">
                  {chatName}
                </h3>
                <div className="flex items-center gap-1.5">
                  <p className={`text-xs font-medium ${isPartnerOnline ? "text-lime-400" : "text-zinc-500"}`}>
                    {isPartnerOnline ? "в сети" : "не в сети"}
                  </p>
                  {partnerPresencePreference === "dnd" && (
                    <BellOff size={12} className="text-amber-400" />
                  )}
                </div>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <ChatMuteToggle chatId={activeChat?.id} />
            <Phone size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
            <MoreVertical size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
          </div>
        </header>

        <MessageList
          messages={messages}
          setMessages={setMessages}
          messagesEndRef={messagesEndRef}
          onReply={onReply}
          onDeleteMessage={onDeleteMessage}
        />
        <InputArea
          inputText={inputText}
          setInputText={setInputText}
          sendMessage={sendMessage}
          isConnected={isConnected}
          replyTo={replyTo}
          onCancelReply={onCancelReply}
        />
      </div>
    );
};
