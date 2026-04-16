import React from "react";
import { User, Phone, MoreVertical } from 'lucide-react';
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";

export const ChatWindow = ({messages, setMessages, activeChat, sendMessage, isConnected, messagesEndRef, inputText, setInputText, chatName}) => {
    if (!activeChat) {
        return (
            <div className="flex-grow flex items-center justify-center bg-zinc-900 text-zinc-500">
                Выберите чат, чтобы начать общение
            </div>
        );
    }
    return (
      <div className="flex-grow flex flex-col bg-zinc-900 shadow-2xl">
        {/* Chat Header */}
        <header className="h-20 flex-shrink-0 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-900/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <User size={20} className="text-lime-400" />
            </div>
            <div>
              <h3 className="font-bold leading-tight">{chatName}</h3>
              <p className="text-xs text-lime-400 font-medium">{isConnected ? "В сети" : "Офлайн"}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <Phone size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
            <MoreVertical size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
          </div>
        </header>

        {/* Message List */}
        <MessageList messages={messages} setMessages={setMessages} messagesEndRef={messagesEndRef} />

        {/* Input Area */}
        <InputArea inputText={inputText} setInputText={setInputText} sendMessage={sendMessage} isConnected={isConnected} />
      </div>
    );
};