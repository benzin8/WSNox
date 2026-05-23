import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, LogOut, User, MessageSquare, Phone, MoreVertical, Search } from 'lucide-react';
import { useChatAction } from '../../hooks/useChatAction';
import { useChatSocket } from '../../hooks/useChatSocket';
import { usePresence } from '../../hooks/usePresence';
import { useProfile } from '../../hooks/useProfile';

import { ChatWindow } from '../../components/chat/ChatWindow';
import { ChatList } from '../../components/chat/ChatList';
import { ProfileModal } from '../../components/profile/ProfileModal';
import { EditProfileModal } from '../../components/profile/EditProfileModal';
import {
  NotificationSettingsProvider,
  PushPromptModal,
  useNotifications,
  useNotificationSettings,
} from '../../features/notifications';

function ChatPage() {
  const token = localStorage.getItem('access_token');

  const [chats, setChats] = useState([]);
  const [inputText, setInputText] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState(null);
  const [chatName, setChatName] = useState('');

  // Profile modal state: { profile, isOwnProfile } or null when closed
  const [profileModal, setProfileModal] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [mobileView, setMobileView] = useState('list');
  const [partnerPresencePreference, setPartnerPresencePreference] = useState(null);

  // Keeps the open chat id readable inside the socket's onmessage closure
  const activeChatIdRef = useRef(null);
  // Mirror of chats state for reading inside effects without stale closure
  const chatsRef = useRef([]);

  const { messages, setMessages, sendMessage, isConnected, lastReceivedMessage, lastPresenceEvent, lastProfileEvent, socketRef } = useChatSocket(token, activeChatIdRef);
  const { onlineUsers, refreshPresence } = usePresence(socketRef, isConnected, lastPresenceEvent);
  const { settings: notificationSettings } = useNotificationSettings();
  const totalUnread = chats.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  useNotifications({
    lastReceivedMessage,
    currentUser,
    activeChatIdRef,
    totalUnread,
    settings: notificationSettings,
  });
  const { searchChats,
          searchResult,
          isSearching,
          getOrCreateChats,
          activeChat,
          setActiveChat,
          getUserDataByChatId,
          getMyData,
          getMessagesByChatId,
          getAllChats,
          markChatAsRead
  } = useChatAction();
  const { fetchMyProfile, fetchUserProfile, updateMyProfile } = useProfile();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);


  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  useEffect(() => {
    const fetchInitialData = async () => {
      const [user, profile, allChats] = await Promise.all([
        getMyData(),
        fetchMyProfile(),
        getAllChats(),
      ]);
      setCurrentUser(user);
      setMyProfile(profile);
      setChats(allChats);
    };

    fetchInitialData();
  }, []);

  // Обновление списка чатов при получении нового сообщения
  useEffect(() => {
    if (!lastReceivedMessage) return;

    const existingChat = chatsRef.current.find(c => c.id === lastReceivedMessage.chat_id);

    if (existingChat) {
      const isActiveChat = lastReceivedMessage.chat_id === activeChatIdRef.current;
      const isOwnMessage = Number(lastReceivedMessage.sender_id) === currentUser?.id;
      if (isActiveChat && !isOwnMessage && !document.hidden) {
        markChatAsRead(lastReceivedMessage.chat_id);
      }
      setChats(prevChats => {
        const idx = prevChats.findIndex(c => c.id === lastReceivedMessage.chat_id);
        if (idx === -1) return prevChats;
        const updatedChat = {
          ...prevChats[idx],
          last_message: lastReceivedMessage.text,
          last_message_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          unread_count: (!isActiveChat && !isOwnMessage)
            ? (prevChats[idx].unread_count || 0) + 1
            : prevChats[idx].unread_count || 0,
        };
        return [updatedChat, ...prevChats.filter(c => c.id !== lastReceivedMessage.chat_id)];
      });
    } else if (lastReceivedMessage.chat_info) {
      setChats(prevChats => {
        if (prevChats.some(c => c.id === lastReceivedMessage.chat_info.id)) return prevChats;
        const newChat = {
          ...lastReceivedMessage.chat_info,
          last_message: lastReceivedMessage.text,
          last_message_time: new Date().toISOString(),
          unread_count: 1,
        };
        return [newChat, ...prevChats];
      });
      refreshPresence();
    } else {
      getAllChats().then(updatedChats => setChats(updatedChats));
    }
  }, [lastReceivedMessage]);

  useEffect(() => {
    activeChatIdRef.current = activeChat?.id ?? null;
  }, [activeChat?.id]);

  // Realtime profile updates from other users
  useEffect(() => {
    if (!lastProfileEvent) return;
    const { user_id, name, display_name } = lastProfileEvent;
    setChats(prev => prev.map(c => (
      c.recipient_id === user_id && c.recipient
        ? { ...c, recipient: { ...c.recipient, name, display_name } }
        : c
    )));
    if (activeChat?.recipient_id === user_id) {
      setChatName(display_name || name);
      setActiveChat(prev => prev ? { ...prev, recipient: { ...(prev.recipient || {}), name, display_name } } : prev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastProfileEvent]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

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

  useEffect(() => {
    if (!activeChat?.recipient_id) {
        setPartnerPresencePreference(null);
        return;
    }
    let cancelled = false;
    (async () => {
        const p = await fetchUserProfile(activeChat.recipient_id);
        if (!cancelled) {
            setPartnerPresencePreference(p?.presence_preference ?? null);
        }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.recipient_id]);

  const handleSendMessage = (text) => {
    if (!activeChat) return;

    sendMessage(text, activeChat.id);

    setMessages((prev) => [...prev, {
            text: text,
            type: 'outgoing',
            id: Date.now(),
            created_at: new Date().toISOString(),
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
      setChatName(selectedChat.recipient.display_name || selectedChat.recipient.name);
      setMobileView('chat');
      setChats(prevChats => prevChats.map(c =>
        c.id === selectedChat.id ? { ...c, unread_count: 0 } : c
      ));
    } else if (selectedChat.id) {
      const chat = await getOrCreateChats(selectedChat.id);
      if (chat) {
        setActiveChat(chat);
        setSearchQuery('');
        const userData = await getUserDataByChatId(chat.id);
        setChatName(userData.display_name || userData.name);
        const allChats = await getAllChats();
        setChats(allChats);
        setMobileView('chat');
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
    if (updated) {
      setProfileModal({ profile: updated, isOwnProfile: true });
      setMyProfile(updated);
    }
  };

  const isPartnerOnline = activeChat?.recipient_id
      ? onlineUsers.has(activeChat.recipient_id)
      : false;

  return (
    <div
      className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <PushPromptModal />
      <div className="relative flex-1 overflow-hidden md:flex">
        {/* Sidebar */}
        <div className={`absolute inset-y-0 left-0 w-full flex flex-col bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-800 z-10 transition-transform duration-200 ease-in-out md:relative md:inset-auto md:w-80 md:translate-x-0 ${mobileView === 'list' ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-6 border-bottom border-zinc-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleOpenOwnProfile}
              className="group flex items-center gap-3 -mx-2 px-2 py-1 rounded-xl hover:bg-zinc-800/50 active:scale-[0.98] transition-all"
              title="Мой профиль"
            >
              <div className="w-10 h-10 rounded-full bg-lime-400 flex items-center justify-center text-zinc-900 font-bold group-hover:bg-lime-300 transition-colors">
                {(myProfile?.display_name || myProfile?.name || currentUser?.name)?.slice(0, 1)?.toUpperCase()}
              </div>
              <span className="font-bold text-lg tracking-tight group-hover:text-lime-400 transition-colors">Чаты</span>
            </button>
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

          <div className="flex-grow min-h-0 overflow-y-auto">
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
                          <h4 className="font-semibold text-zinc-100">{user.name}</h4>
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
                onlineUsers={onlineUsers}
              />
            )}
          </div>
        </div>
        <div className={`absolute inset-y-0 left-0 w-full flex flex-col transition-transform duration-200 ease-in-out md:relative md:inset-auto md:flex-1 md:translate-x-0 ${mobileView === 'chat' ? 'translate-x-0' : 'translate-x-full'}`}>
          <ChatWindow activeChat={activeChat}
           messages={messages}
           setMessages={setMessages}
           sendMessage={handleSendMessage}
           isConnected={isConnected}
           isPartnerOnline={isPartnerOnline}
           partnerPresencePreference={partnerPresencePreference}
           messagesEndRef={messagesEndRef}
           inputText={inputText}
           setInputText={setInputText}
           chatName={chatName}
           onOpenProfile={() => activeChat?.recipient_id && handleOpenUserProfile(activeChat.recipient_id)}
           onBack={() => setMobileView('list')}
           />
        </div>

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
    </div>
  );
}

export default function ChatPageWithProviders() {
  return (
    <NotificationSettingsProvider>
      <ChatPage />
    </NotificationSettingsProvider>
  );
}
