import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { Send, LogOut, User, MessageSquare, Phone, MoreVertical, Search } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const WS_BASE = import.meta.env.VITE_WS_BASE_URL;

function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // 1. Get user profile and setup WebSocket
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/auth/send-code');
      return;
    }

    try {
      const decoded = jwtDecode(token);
      setCurrentUser(decoded);
      
      const userId = decoded.sub || decoded.user_id; // Check your JWT schema
      const wsUrl = `${WS_BASE}/chat/${userId}`;
      const ws = new WebSocket(wsUrl);
      
      socketRef.current = ws;

      ws.onopen = () => setIsConnected(true);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setMessages((prev) => [...prev, { ...data, type: 'incoming', id: Date.now() }]);
      };
      ws.onclose = () => setIsConnected(false);

      return () => ws.close();
    } catch (err) {
      console.error('Auth error:', err);
      navigate('/auth/send-code');
    }
  }, [navigate]);

  // 2. Sending logic
  const sendMessage = useCallback((e) => {
    e?.preventDefault();
    if (!inputText.trim() || !isConnected) return;
    
    // Assuming a simple payload for now
    const payload = { 
      message: inputText.trim(),
      recipient_id: 1 // Test recipient
    }; 
    
    socketRef.current.send(JSON.stringify(payload));
    
    setMessages((prev) => [...prev, { 
      message: inputText.trim(), 
      type: 'outgoing', 
      id: Date.now(),
      sender: 'You'
    }]);
    
    setInputText('');
  }, [inputText, isConnected]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/auth/send-code');
  };

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
              type="text" 
              placeholder="Search chats..."
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-lime-400/50 transition-all"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-2 space-y-1 scrollbar-hide">
          {/* Mock Contact */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50 cursor-pointer hover:bg-zinc-800 transition-all">
            <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center">
              <User size={24} className="text-zinc-400" />
            </div>
            <div className="flex-grow">
              <div className="flex justify-between items-baseline">
                  <h4 className="font-semibold">Бот помошник</h4>
                  <span className="text-[10px] text-zinc-500 uppercase">Online</span>
              </div>
              <p className="text-xs text-zinc-400 truncate">Чем я могу вам помочь сегодня?</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-grow flex flex-col bg-zinc-900 shadow-2xl">
        {/* Chat Header */}
        <header className="h-20 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-900/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <User size={20} className="text-lime-400" />
            </div>
            <div>
              <h3 className="font-bold leading-tight">Бот помошник</h3>
              <p className="text-xs text-lime-400 font-medium">В сети</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <Phone size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
            <MoreVertical size={20} className="hover:text-lime-400 cursor-pointer transition-colors" />
          </div>
        </header>

        {/* Message List */}
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
                {msg.message}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-zinc-900/50 border-t border-zinc-800">
          <form 
            onSubmit={sendMessage}
            className="flex items-center gap-3 bg-zinc-800 rounded-2xl p-2 pl-4 border border-zinc-700 focus-within:border-lime-400/50 focus-within:ring-4 focus-within:ring-lime-500/10 transition-all"
          >
            <input 
              type="text"
              placeholder="Type your message..."
              className="flex-grow bg-transparent border-none focus:outline-none text-sm py-2"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button 
              type="submit"
              disabled={!inputText.trim() || !isConnected}
              className="p-3 bg-lime-400 text-zinc-900 rounded-xl hover:bg-lime-300 transition-all disabled:grayscale disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;