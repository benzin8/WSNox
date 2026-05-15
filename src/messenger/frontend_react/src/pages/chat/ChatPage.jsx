import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { Send, LogOut, User, MessageSquare, Phone, MoreVertical, Search } from 'lucide-react';
import { useChatAction } from '../../hooks/useChatAction';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useProfile } from '../../hooks/useProfile';

import { ChatWindow } from '../../components/chat/ChatWindow';
import { ChatList } from '../../components/chat/ChatList';
import { ProfileModal } from '../../components/profile/ProfileModal';
import { EditProfileModal } from '../../components/profile/EditProfileModal';

function ChatPage() {
  const token = localStorage.getItem('access_token');

  const [chats, setChats] = useState([]);
  const [inputText, setInputText] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState(null);
  const [chatName, setChatName] = useState('');

  // Profile modal state: { profile, isOwnProfile } or null when closed
  const [profileModal, setProfileModal] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const { messages, setMessages, sendMessage, isConnected, lastReceivedMessage } = useChatSocket(token);
  const { searchChats,
          searchResult,
          isSearching,
          error,
          getOrCreateChats,
          activeChat,
          setActiveChat,
          getUserDataByChatId,
          getMyData,
          getMessagesByChatId,
          getAllChats
  } = useChatAction();
  const { fetchMyProfile, fetchUserProfile, updateMyProfile } = useProfile();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);


  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  useEffect(() => {
    const fetchInitialData = async () => {
      const user = await getMyData();
      setCurrentUser(user);

      const allChats = await getAllChats();
      setChats(allChats);
    };

    fetchInitialData();
  }, []);

  // Обновление списка чатов при получении нового сообщения
  useEffect(() => {
    if (lastReceivedMessage) {
      setChats(prevChats => {
        const existingChatIndex = prevChats.findIndex(c => c.id === lastReceivedMessage.chat_id);

        if (existingChatIndex !== -1) {
          const updatedChat = {
            ...prevChats[existingChatIndex],
            last_message: lastReceivedMessage.text,
            last_message_time: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          const otherChats = prevChats.filter(c => c.id !== lastReceivedMessage.chat_id);
          return [updatedChat, ...otherChats];
        } else {
          getAllChats().then(updatedChats => setChats(updatedChats));
          return prevChats;
        }
      });
    }
  }, [lastReceivedMessage]);

  useEffect(() => {
    if (activeChat?.id && currentUser?.id) {
      const fetchMessages = async () => {
        const msgs = await getMessagesByChatId(activeChat.id);
        const mappedMsgs = msgs.map(m => ({
          ...m,
          text: m.text,
          type: m.sender_id === currentUser.id ? 'outgoing' : 'incoming'
        }));
        setMessages(mappedMsgs);
      }
      fetchMessages();
    }
  }, [activeChat?.id, currentUser?.id]);

  const handleSendMessage = (text) => {
    if (!activeChat) return;

    sendMessage(text, activeChat.id, activeChat.recipient_id);
    console.log("message to", activeChat.recipient_id, text);

    setMessages((prev) => [...prev, {
            text: text,
            type: 'outgoing',
            id: Date.now()
        }]);
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/auth/send-code');
  };

  // Выбор чата
  const handleSelectChat = async (selectedChat) => {
    if (selectedChat.recipient) {
      setActiveChat(selectedChat);
      setChatName(selectedChat.recipient.username);
    } else if (selectedChat.id) {
      const chat = await getOrCreateChats(selectedChat.id);
      if (chat) {
        setActiveChat(chat);
        setSearchQuery('');
        const userData = await getUserDataByChatId(chat.id);
        setChatName(userData.username);
        const allChats = await getAllChats();
        setChats(allChats);
      }
    }
  }

  // Open own profile modal
  const handleOpenOwnProfile = async () => {
    const p = await fetchMyProfile();
    if (p) setProfileModal({ profile: p, isOwnProfile: true });
  };

  // Open another user's profile modal by their user ID
  const handleOpenUserProfile = async (userId) => {
    const p = await fetchUserProfile(userId);
    if (p) setProfileModal({ profile: p, isOwnProfile: false });
  };

  // Save changes from EditProfileModal and refresh the modal profile state
  const handleSaveProfile = async (data) => {
    const updated = await updateMyProfile(data);
    if (updated) setProfileModal({ profile: updated, isOwnProfile: true });
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/50 backdrop-blur-xl">
        <div className="p-6 border-bottom border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Clicking the avatar opens own profile */}
            <div
              onClick={handleOpenOwnProfile}
              className="w-10 h-10 rounded-full bg-lime-400 flex items-center justify-center text-zinc-900 font-bold cursor-pointer hover:bg-lime-300 transition-colors"
              title="Мой профиль"
            >
              {currentUser?.username?.slice(0, 1)?.toUpperCase()}
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

        <div className="flex-grow overflow-y-auto">
          {searchQuery?.length > 0 ? (
            <div className="p-2 space-y-1">
              {searchResult?.length > 0 ? (
                searchResult.map((user) => (
                  <div key={user.id} onClick={() => handleSelectChat(user)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-lime-400/5 border border-lime-400/20 cursor-pointer hover:bg-lime-400/10 transition-all group">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center group-hover:border-lime-400/50">
                      <User size={24} className="text-zinc-400 group-hover:text-lime-400" />
                    </div>
                    <div className="flex-grow">
                      <div className="flex justify-between items-baseline">
                        <h4 className="font-semibold text-zinc-100">{user.username}</h4>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                !isSearching && (
                  <div className="p-4 text-center text-zinc-500 text-sm">
                    Пользователь "{searchQuery}" не найден
                  </div>
                )
              )}
            </div>
          ) : (
            <ChatList
              chats={chats}
              activeChatId={activeChat?.id}
              onSelectChat={handleSelectChat}
            />
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
       onOpenProfile={() => activeChat?.recipient_id && handleOpenUserProfile(activeChat.recipient_id)}
       />

      {/* Profile view modal */}
      {profileModal && (
        <ProfileModal
          profile={profileModal.profile}
          isOwnProfile={profileModal.isOwnProfile}
          onClose={() => setProfileModal(null)}
          onEdit={() => setShowEditModal(true)}
        />
      )}

      {/* Edit profile modal — shown on top of ProfileModal */}
      {showEditModal && profileModal && (
        <EditProfileModal
          profile={profileModal.profile}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveProfile}
        />
      )}
    </div>
  );
}

export default ChatPage;
