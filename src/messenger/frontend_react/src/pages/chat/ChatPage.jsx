import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { Send, LogOut, User, MessageSquare, Phone, MoreVertical, Search } from 'lucide-react';
import { useChatAction } from '../../hooks/useChatAction';
import { useChatSocket } from '../../hooks/useChatSocket';

import { ChatWindow } from '../../components/chat/ChatWindow';

function ChatPage() {
  const token = localStorage.getItem('access_token');

  const [inputText, setInputText] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState(null);
  const [chatName, setChatName] = useState('');

  const { messages, setMessages, sendMessage, isConnected } = useChatSocket(token);
  const { searchChats, searchResult, isSearching, error, getOrCreateChats, activeChat, setActiveChat, getUserDataByChatId } = useChatAction();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);


  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (text) => {
    if (!activeChat) return;

    sendMessage(text, activeChat.id, activeChat.recipient_id);
    console.log("message to", activeChat.recipient_id, text);

    setMessages((prev) => [...prev, {
            message: text,
            type: 'outgoing',
            id: Date.now()
        }]);
  }
  
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/auth/send-code');
  };

  const handleSelectChat = async (userID) => {
    const chat = await getOrCreateChats(userID)
    if (chat) {
      setSearchQuery(null);
      const userData = await getUserDataByChatId(chat.id)
      setChatName(userData.username);
    }
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/50 backdrop-blur-xl">
        <div className="p-6 border-bottom border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-lime-400 flex items-center justify-center text-zinc-900 font-bold">
              {currentUser?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <span className="font-bold text-lg tracking-tight">Чаты</span>
          </div>
          <button onClick={handleLogout} className="text-zinc-500 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input 
              onChange={(e) => {searchChats(e.target.value); setSearchQuery(e.target.value)}}
              type="text" 
              placeholder="Search chats..."
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-lime-400/50 transition-all"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-2 space-y-1 scrollbar-hide">
          {searchQuery?.length > 0 && searchResult?.length > 0 ? (
            searchResult.map((chat) => (
              <div key={chat.id} onClick={() => handleSelectChat(chat.id)}
                className="flex items-center gap-3 p-3 rounded-xl bg-lime-400/5 border border-lime-400/20 cursor-pointer hover:bg-lime-400/10 transition-all group">
                <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center group-hover:border-lime-400/50">
                  <User size={24} className="text-zinc-400 group-hover:text-lime-400" />
                </div>
                <div className="flex-grow">
                  <div className="flex justify-between items-baseline">
                    <h4 className="font-semibold text-zinc-100">{chat.username}</h4>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <>
            {searchQuery?.length >= 1 && searchResult?.length === 0 && !isSearching && (
              <div className="p-1 text-center text-zinc-500 text-sm">
                Чат или пользователь "{searchQuery}" не найден
              </div>
            )}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50 cursor-pointer hover:bg-zinc-800 transition-all">
              <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center">
                <User size={24} className="text-zinc-400" />
              </div>
              <div className="flex-grow">
              <div className="flex justify-between items-baseline">
                  <h4 className="font-semibold">Бот помошник</h4> {/* TODO: add name */}
                  <span className="text-[10px] text-zinc-500 uppercase">Online</span> {/* TODO: add online status */}
              </div>
              <p className="text-xs text-zinc-400 truncate">Чем я могу вам помочь сегодня?</p> {/* TODO: add last message */}
              </div>
            </div>
          </>
          )}
        </div>
      </div>
      <ChatWindow activeChat={activeChat}
       messages={messages}
       setMessages={setMessages}
       sendMessage={handleSendMessage}
       isConnected={isConnected}
       messagesEndRef={messagesEndRef}
       inputText={inputText}
       setInputText={setInputText}
       chatName={chatName} 
       />
    </div>
  );
}

export default ChatPage;