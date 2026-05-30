import React from 'react';
import { User, Sparkles } from 'lucide-react';
import { useEnergy } from '../../features/energy';
import { Avatar } from '../profile/Avatar';

export const ChatList = ({ chats, activeChatId, onSelectChat, onlineUsers }) => {
  const { randomInChat } = useEnergy();
  // Сортируем чаты по последнему сообщению или времени обновления
  const sortedChats = [...chats].sort((a, b) => {
    const timeA = new Date(a.last_message_time || a.updated_at || 0).getTime();
    const timeB = new Date(b.last_message_time || b.updated_at || 0).getTime();
    return timeB - timeA;
  });

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-lime-400/10 border border-lime-400/20 flex items-center justify-center mb-4">
          <User size={32} className="text-lime-400" />
        </div>
        <p className="text-sm font-medium text-zinc-400">Пока нет чатов</p>
        <p className="text-xs text-zinc-500 mt-1 mb-4">Найдите собеседника через поиск</p>
        <button
          type="button"
          onClick={() => randomInChat()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-zinc-400 border border-zinc-700/60 bg-zinc-800/40 hover:border-lime-400/40 hover:text-lime-400 transition-colors"
        >
          <Sparkles size={12} className="text-lime-400" />
          Демо анимации энергии
        </button>
      </div>
    );
  }

  return (
    <div className="flex-grow overflow-y-auto p-2 space-y-1 scrollbar-hide">
      {sortedChats.map((chat) => {
        const isSelected = activeChatId === chat.id;
        const displayName = chat.recipient?.display_name || chat.recipient?.name || chat.name || "Чат";
        const lastMsg = chat.last_message || "Нет сообщений";
        const time = chat.last_message_time || chat.updated_at;
        const formattedTime = time 
          ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
          : '';

        return (
          <div
            key={chat.id}
            onClick={() => onSelectChat(chat)}
            className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-300 group relative overflow-hidden ${
              isSelected 
                ? 'bg-lime-400/10 border border-lime-400/20 shadow-[0_0_20px_rgba(163,230,53,0.05)]' 
                : 'bg-zinc-800/30 border border-zinc-700/50 hover:bg-zinc-800/60 hover:border-zinc-600'
            }`}
          >
            {isSelected && (
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-lime-400 rounded-r-full shadow-[0_0_10px_rgba(163,230,53,0.5)]" />
            )}
            
            <Avatar
              url={chat.recipient?.avatar_thumb_url}
              initials={(displayName || "?").split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
              online={onlineUsers?.has(chat.recipient_id)}
              size={48}
              className={`flex-shrink-0 transition-all duration-300 ${
                isSelected ? 'scale-105 shadow-lg shadow-lime-400/20' : ''
              }`}
            />

            <div className="flex-grow min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <h4 className={`font-bold truncate transition-colors duration-300 ${
                  isSelected ? 'text-white' : 'text-zinc-100 group-hover:text-white'
                }`}>
                  {displayName}
                </h4>
                <span className={`text-[10px] font-medium uppercase tracking-wider transition-colors duration-300 ${
                  isSelected ? 'text-lime-400/80' : 'text-zinc-500 group-hover:text-zinc-400'
                }`}>
                  {formattedTime}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <p className={`text-xs truncate leading-relaxed transition-colors duration-300 ${
                  isSelected ? 'text-zinc-300' : 'text-zinc-400 group-hover:text-zinc-300'
                }`}>
                  {lastMsg}
                </p>
                {chat.unread_count > 0 && (
                  <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-lime-400 flex items-center justify-center text-[10px] font-bold text-zinc-900">
                    {chat.unread_count > 99 ? '99+' : chat.unread_count}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
