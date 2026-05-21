import React from "react";
import { User, Phone, MoreVertical, ChevronLeft, BellOff } from 'lucide-react';
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";

export const ChatWindow = ({
    messages, setMessages, activeChat, sendMessage,
    isConnected, messagesEndRef, inputText, setInputText,
    chatName, onOpenProfile, onBack,
    isPartnerOnline, partnerPresencePreference
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
        <header className="h-20 flex-shrink-0 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-900/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onBack?.()}
              className="md:hidden text-zinc-400 hover:text-lime-400 transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <User size={20} className="text-lime-400" />
            </div>
            <div>
              {/* Clicking the name opens the other user's profile */}
              <h3
                onClick={onOpenProfile}
                className="font-bold leading-tight cursor-pointer hover:text-lime-400 transition-colors"
                title="Открыть профиль"
              >
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
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <Phone size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
            <MoreVertical size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
          </div>
        </header>

        <MessageList messages={messages} setMessages={setMessages} messagesEndRef={messagesEndRef} />
        <InputArea inputText={inputText} setInputText={setInputText} sendMessage={sendMessage} isConnected={isConnected} />
      </div>
    );
};
