import React from 'react';
import { User } from 'lucide-react';

export const ChatList = ({ chats, activeChatId, onSelectChat }) => {
  // Сортируем чаты по последнему сообщению или времени обновления
  const sortedChats = [...chats].sort((a, b) => {
    const timeA = new Date(a.last_message_time || a.updated_at || 0).getTime();
    const timeB = new Date(b.last_message_time || b.updated_at || 0).getTime();
    return timeB - timeA;
  });

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-zinc-500">
        <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
          <User size={32} className="text-zinc-700" />
        </div>
        <p className="text-sm">No chats yet</p>
      </div>
    );
  }

  return (
    <div className="flex-grow overflow-y-auto p-2 space-y-1 scrollbar-hide">
      {sortedChats.map((chat) => {
        const isSelected = activeChatId === chat.id;
        const displayName = chat.recipient?.username || chat.name || "Чат";
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
            
            <div className={`relative w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300 ${
              isSelected ? 'bg-lime-400 scale-105 shadow-lg shadow-lime-400/20' : 'bg-zinc-800 border border-zinc-700 group-hover:border-zinc-500'
            }`}>
              <User size={24} className={isSelected ? 'text-zinc-950' : 'text-zinc-400 group-hover:text-zinc-200'} />
              {/* Online status indicator placeholder */}
              <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-900" />
            </div>

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
              <p className={`text-xs truncate leading-relaxed transition-colors duration-300 ${
                isSelected ? 'text-zinc-300' : 'text-zinc-400 group-hover:text-zinc-300'
              }`}>
                {lastMsg}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
