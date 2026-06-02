import React from "react";
import { Phone, MoreVertical, ChevronLeft, BellOff, MessageCircle, LogOut, Trash2 } from 'lucide-react';
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
import { ChatMuteToggle } from "../../features/notifications";
import { Avatar } from "../profile/Avatar";
import { GroupAvatar } from "./GroupAvatar";

export const ChatWindow = ({
    messages, setMessages, activeChat, sendMessage,
    isConnected, isConnecting, messagesEndRef, inputText, setInputText,
    chatName, onOpenProfile, onBack,
    isPartnerOnline, partnerPresencePreference,
    replyTo, onReply, onCancelReply, onDeleteMessage,
    editingMessage, onEditMessage, onCancelEdit, onConfirmEdit,
    onPickMedia, onRetryMedia, onLeaveGroup, onDeleteGroup,
}) => {
    const [menuOpen, setMenuOpen] = React.useState(false);
    React.useEffect(() => { setMenuOpen(false); }, [activeChat?.id]);
    const isGroup = activeChat?.chat_type === "group";
    if (!activeChat) {
        return (
            <div className="flex-grow flex items-center justify-center relative overflow-hidden">
                {/* Glow */}
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-lime-400/[0.04] blur-[120px] pointer-events-none" />
                <div className="relative flex flex-col items-center text-center p-8">
                    <div className="w-20 h-20 rounded-full bg-lime-400/10 border border-lime-400/20 flex items-center justify-center mb-6">
                        <MessageCircle size={36} className="text-lime-400" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-zinc-100 mb-2">Выберите чат</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">Выберите чат из списка слева, чтобы начать общение</p>
                </div>
            </div>
        );
    }
    return (
      <div className="flex-grow flex flex-col min-h-0 shadow-2xl">
        {/* Chat Header */}
        <header className="h-20 flex-shrink-0 border-b border-zinc-800/80 flex items-center justify-between px-6 bg-zinc-950/90 backdrop-blur-md">
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
              className="group flex items-center gap-3 -mx-2 px-2 py-1 rounded-xl active:scale-[0.98] transition-all min-w-0 hover:bg-zinc-800/50"
              title={isGroup ? "Участники группы" : "Открыть профиль"}
            >
              {isGroup ? (
                <GroupAvatar
                  id={activeChat?.id}
                  name={activeChat?.name || chatName}
                  size={44}
                  className="shrink-0"
                />
              ) : (
                <Avatar
                  url={activeChat?.recipient?.avatar_thumb_url}
                  initials={(chatName || "?").split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                  online={isPartnerOnline}
                  size={44}
                  className="shrink-0 group-hover:ring-2 group-hover:ring-lime-400/60 transition-all"
                />
              )}
              <div className="text-left min-w-0">
                <h3 className={`font-bold leading-tight truncate ${isGroup ? "text-zinc-100" : "group-hover:text-lime-400 transition-colors"}`}>
                  {isGroup ? (activeChat?.name || chatName) : chatName}
                </h3>
                <div className="flex items-center gap-1.5">
                  {isGroup ? (
                    <p className="text-xs font-medium text-zinc-500">
                      {activeChat?.member_count ? `${activeChat.member_count} участников` : "группа"}
                    </p>
                  ) : (
                    <>
                      <p className={`text-xs font-medium ${isPartnerOnline ? "text-lime-400" : "text-zinc-500"}`}>
                        {isPartnerOnline ? "в сети" : "не в сети"}
                      </p>
                      {partnerPresencePreference === "dnd" && (
                        <BellOff size={12} className="text-amber-400" />
                      )}
                    </>
                  )}
                </div>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-4 text-zinc-400 relative">
            <ChatMuteToggle chatId={activeChat?.id} />
            {!isGroup && (
              <Phone size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="hover:text-lime-400 cursor-pointer transition-colors p-1 -m-1 rounded-md"
              aria-label="Меню чата"
            >
              <MoreVertical size={20} />
            </button>
            {menuOpen && isGroup && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 z-30">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onLeaveGroup?.(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <LogOut size={16} /> Покинуть группу
                </button>
                {onDeleteGroup && (
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onDeleteGroup?.(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
                  >
                    <Trash2 size={16} /> Удалить группу
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {!isConnected && (
          <div className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-400/10 border-b border-amber-400/20 text-amber-400 text-xs font-medium animate-pulse">
            <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {isConnecting ? 'Подключение к серверу...' : 'Нет соединения. Переподключение...'}
          </div>
        )}

        <MessageList
          messages={messages}
          setMessages={setMessages}
          messagesEndRef={messagesEndRef}
          onReply={onReply}
          onDeleteMessage={onDeleteMessage}
          onEditMessage={onEditMessage}
          onRetryMedia={onRetryMedia}
          isGroup={isGroup}
        />
        <InputArea
          inputText={inputText}
          setInputText={setInputText}
          sendMessage={sendMessage}
          isConnected={isConnected}
          replyTo={replyTo}
          onCancelReply={onCancelReply}
          editingMessage={editingMessage}
          onCancelEdit={onCancelEdit}
          onConfirmEdit={onConfirmEdit}
          onPickMedia={onPickMedia}
        />
      </div>
    );
};
