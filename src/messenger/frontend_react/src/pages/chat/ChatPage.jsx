import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, LogOut, User, MessageSquare, Phone, MoreVertical, Search } from 'lucide-react';
import { useChatAction } from '../../hooks/useChatAction';
import { useChatSocket } from '../../hooks/useChatSocket';
import { usePresence } from '../../hooks/usePresence';
import { useProfile } from '../../hooks/useProfile';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { useEdgeSwipe } from '../../hooks/useEdgeSwipe';
import { useEnergy } from '../../features/energy';

import { ChatWindow } from '../../components/chat/ChatWindow';
import { ChatList } from '../../components/chat/ChatList';
import { MediaPreviewModal } from '../../components/chat/MediaPreviewModal';
import { ProfileModal } from '../../components/profile/ProfileModal';
import { EditProfileModal } from '../../components/profile/EditProfileModal';
import { Avatar } from '../../components/profile/Avatar';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
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
  const [chatListBlurred, setChatListBlurred] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);

  // Tracks the chat currently held in `activeChat` state — regardless of
  // whether it's visually on screen on mobile. Used by reconnect refetch.
  const activeChatIdRef = useRef(null);
  // Reflects what the user is actually looking at: on desktop = activeChat,
  // on mobile only when mobileView === 'chat'. Drives messages_state push,
  // mark-as-read, notification suppression — anything tied to "user sees this".
  const viewingChatIdRef = useRef(null);
  // Mirror of chats state for reading inside effects without stale closure
  const chatsRef = useRef([]);
  // Track whether this is first connect (skip refetch) or a reconnect
  const hasConnectedOnceRef = useRef(false);

  // Mobile breakpoint — reactive media query so view-gating updates if
  // the device rotates or window resizes between md and below.
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  const { messages, setMessages, sendMessage, editMessage, isConnected, isConnecting, lastReceivedMessage, lastPresenceEvent, lastProfileEvent, socketRef } = useChatSocket(token, activeChatIdRef);
  const { onlineUsers, refreshPresence } = usePresence(socketRef, isConnected, lastPresenceEvent);
  const { settings: notificationSettings } = useNotificationSettings();
  const totalUnread = chats.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  useNotifications({
    lastReceivedMessage,
    currentUser,
    activeChatIdRef: viewingChatIdRef,
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
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const { orb, settleInChat, randomInChat } = useEnergy();
  const inTransit = orb.phase === 'transit';

  useEffect(() => {
    const t = setTimeout(() => settleInChat(), 0);
    return () => clearTimeout(t);
  }, [settleInChat]);


  // Auto-scroll. Skip when the chat panel is offscreen on mobile —
  // scrollIntoView on a transform-translated, hidden element can drag
  // the layout viewport sideways on iOS Safari and break the slider.
  useEffect(() => {
    if (isMobile && mobileView !== 'chat') return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, mobileView, isMobile]);

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

  // Sync missed messages on WebSocket reconnect (e.g. after phone was off)
  useEffect(() => {
    if (!isConnected) return;

    if (!hasConnectedOnceRef.current) {
      // First connect — fetchInitialData already handles loading
      hasConnectedOnceRef.current = true;
      return;
    }

    // Reconnect — refetch chat list and active chat messages from DB
    getAllChats().then(updatedChats => setChats(updatedChats));

    if (activeChatIdRef.current && currentUser?.id) {
      getMessagesByChatId(activeChatIdRef.current).then(msgs => {
        if (!msgs) return;
        setMessages(msgs.map(m => ({
          ...m,
          text: m.text,
          type: m.sender_id === currentUser.id ? 'outgoing' : 'incoming',
          reply_to_id: m.reply_to_id || null,
          reply_to_text: m.reply_to_text || null,
          edited_at: m.edited_at || null,
        })));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Обновление списка чатов при получении нового сообщения
  useEffect(() => {
    if (!lastReceivedMessage) return;

    const existingChat = chatsRef.current.find(c => c.id === lastReceivedMessage.chat_id);

    if (existingChat) {
      // "Viewing" — user can actually see the chat right now. On mobile
      // list view this is false even if activeChat is set, so we count
      // the message as unread and skip mark-as-read.
      const isViewing = lastReceivedMessage.chat_id === viewingChatIdRef.current;
      const isOwnMessage = Number(lastReceivedMessage.sender_id) === currentUser?.id;
      if (isViewing && !isOwnMessage && !document.hidden) {
        markChatAsRead(lastReceivedMessage.chat_id);
        // Send WS read receipt for real-time notification
        const ws = socketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN && lastReceivedMessage.message_id) {
          ws.send(JSON.stringify({
            type: 'message_read',
            chat_id: lastReceivedMessage.chat_id,
            last_message_id: lastReceivedMessage.message_id,
          }));
        }
      }
      setChats(prevChats => {
        const idx = prevChats.findIndex(c => c.id === lastReceivedMessage.chat_id);
        if (idx === -1) return prevChats;
        const updatedChat = {
          ...prevChats[idx],
          last_message: lastReceivedMessage.text,
          last_message_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          unread_count: (!isViewing && !isOwnMessage)
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

  useEffect(() => {
    const viewing = !isMobile || mobileView === 'chat';
    viewingChatIdRef.current = viewing ? (activeChat?.id ?? null) : null;
  }, [activeChat?.id, mobileView, isMobile]);

  // Tell the server which chat is currently open so it can suppress pushes
  // for that chat (within the server-side TTL grace window).
  useEffect(() => {
    if (!isConnected) return;
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const viewingId = mobileView === 'list' ? null : (activeChat?.id ?? null);
    ws.send(JSON.stringify({ type: 'viewing_chat', chat_id: viewingId }));
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'viewing_chat', chat_id: null }));
      }
    };
  }, [activeChat?.id, mobileView, isConnected, socketRef]);

  // Realtime profile updates from other users
  useEffect(() => {
    if (!lastProfileEvent) return;
    const { user_id, name, display_name, avatar_thumb_url, avatar_uploaded_at, read_receipts_changed } = lastProfileEvent;
    if (name || display_name || avatar_thumb_url !== undefined) {
      setChats(prev => prev.map(c => (
        c.recipient_id === user_id && c.recipient
          ? { ...c, recipient: { ...c.recipient, name, display_name, avatar_thumb_url } }
          : c
      )));
      if (activeChat?.recipient_id === user_id) {
        setChatName(display_name || name);
        setActiveChat(prev => prev ? { ...prev, recipient: { ...(prev.recipient || {}), name, display_name, avatar_thumb_url, avatar_uploaded_at } } : prev);
      }
    }
    // When partner changes read receipts, refresh messages to update read_at visibility
    if (read_receipts_changed && activeChat?.recipient_id === user_id) {
      getMessagesByChatId(activeChat.id).then(msgs => {
        if (!msgs) return;
        const mappedMsgs = msgs.map(m => ({
          ...m,
          text: m.text,
          type: m.sender_id === currentUser?.id ? 'outgoing' : 'incoming',
          reply_to_id: m.reply_to_id || null,
          reply_to_text: m.reply_to_text || null,
          edited_at: m.edited_at || null,
        }));
        setMessages(mappedMsgs);
      });
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
          type: m.sender_id === currentUser.id ? 'outgoing' : 'incoming',
          reply_to_id: m.reply_to_id || null,
          reply_to_text: m.reply_to_text || null,
          edited_at: m.edited_at || null,
        }));
        setMessages(mappedMsgs);
        // Send WS read receipt for the latest incoming message
        const lastIncoming = [...msgs].reverse().find(m => m.sender_id !== currentUser.id);
        if (lastIncoming && !document.hidden) {
          const ws = socketRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'message_read',
              chat_id: activeChat.id,
              last_message_id: lastIncoming.id,
            }));
          }
        }
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

  const handleSendMessage = (text, replyMsg) => {
    if (!activeChat) return;

    const tempId = Date.now();
    sendMessage(text, activeChat.id, replyMsg?.id ?? null, tempId);

    setMessages((prev) => [...prev, {
            text: text,
            type: 'outgoing',
            id: tempId,
            created_at: new Date().toISOString(),
            reply_to_id: replyMsg?.id ?? null,
            reply_to_text: replyMsg?.text ?? null,
            // Persist the original message's msg_type so the quote can render
            // "Фото"/"Видео" immediately for our own optimistic copy — without
            // this we'd only see the proper label after a page refresh once
            // the server-side reply_to_msg_type comes back via GET /messages.
            reply_to_msg_type: replyMsg?.msg_type ?? null,
            client_status: 'pending',
        }]);
  }

  // ── media flow ─────────────────────────────────────────────────────
  const [pendingMediaFile, setPendingMediaFile] = useState(null);

  const handlePickMedia = useCallback((file) => {
    setPendingMediaFile(file);
  }, []);

  const uploadMediaToChat = useCallback(async (chatId, tempId, file, caption, meta) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('caption', caption || '');
    // Server uses this to send back a WS `message_ack` so the optimistic
    // upload still flips to "sent" even if the HTTP response is lost.
    fd.append('client_msg_id', String(tempId));
    if (meta) fd.append('client_meta', JSON.stringify(meta));
    return axios.post(`${API_BASE_URL}/chats/${chatId}/media`, fd, {
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      onUploadProgress: (e) => {
        if (!e.total) return;
        const pct = Math.round((e.loaded * 100) / e.total);
        setMessages((prev) => prev.map((m) =>
          m.id === tempId ? { ...m, upload_progress: pct } : m,
        ));
      },
    });
  }, [setMessages]);

  const handleSendMedia = useCallback(async (file, caption, meta) => {
    if (!activeChat?.id) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localUrl = URL.createObjectURL(file);
    const msgType = file.type.startsWith('image/') ? 'image' : 'video';

    setPendingMediaFile(null);
    setMessages((prev) => [...prev, {
      id: tempId,
      type: 'outgoing',
      text: caption || '',
      created_at: new Date().toISOString(),
      msg_type: msgType,
      attachment_url: localUrl,
      attachment_thumb_url: localUrl,
      attachment_meta: meta || null,
      client_status: 'uploading',
      upload_progress: 0,
      // squirreled away so we can rebuild the upload on retry
      _retry_file: file,
      _retry_caption: caption,
      _retry_meta: meta,
    }]);

    try {
      const res = await uploadMediaToChat(activeChat.id, tempId, file, caption, meta);
      const server = res.data;
      setMessages((prev) => prev.map((m) =>
        m.id === tempId
          ? {
              ...m,
              id: server.id,
              attachment_url: server.attachment_url,
              attachment_thumb_url: server.attachment_thumb_url || server.attachment_url,
              attachment_meta: server.attachment_meta || m.attachment_meta,
              client_status: 'sent',
              upload_progress: undefined,
              _retry_file: undefined,
              _retry_caption: undefined,
              _retry_meta: undefined,
            }
          : m,
      ));
      URL.revokeObjectURL(localUrl);
    } catch (err) {
      console.error('media upload failed', err);
      // Wait briefly — the server may have processed the upload and is
      // sending a WS `message_ack` even though our HTTP response was
      // lost (slow link / proxy timeout / network blip). If the ack
      // beats us, tempId no longer exists and this map is a no-op.
      setTimeout(() => {
        setMessages((prev) => prev.map((m) =>
          m.id === tempId
            ? { ...m, client_status: 'failed' }
            : m,
        ));
      }, 2500);
    }
  }, [activeChat?.id, setMessages, uploadMediaToChat]);

  const handleRetryMedia = useCallback((msg) => {
    if (!msg?._retry_file) return;
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    handleSendMedia(msg._retry_file, msg._retry_caption || '', msg._retry_meta || null);
  }, [handleSendMedia, setMessages]);

  const handleReply = useCallback((msg) => {
    setReplyTo(msg);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const handleEditMessage = useCallback((msg) => {
    setEditingMessage(msg);
    setReplyTo(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const handleConfirmEdit = useCallback((msg, newText) => {
    if (!activeChat?.id || !msg.id) return;
    // Optimistic update
    setMessages(prev => prev.map(m =>
      m.id === msg.id ? { ...m, text: newText, edited_at: new Date().toISOString() } : m
    ));
    editMessage(msg.id, activeChat.id, newText);
    setEditingMessage(null);
  }, [activeChat?.id, editMessage, setMessages]);

  const handleDeleteMessage = useCallback((msg) => {
    // Only outgoing messages with a server-assigned id can be deleted
    if (!msg.id || !activeChat?.id) return;
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'delete_message',
        message_id: msg.id,
        chat_id: activeChat.id,
      }));
    }
    // Optimistic removal
    setMessages(prev => prev.filter(m => m.id !== msg.id));
  }, [activeChat?.id, socketRef, setMessages]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/auth/send-code');
  };

  // Выбор чата
  const handleSelectChat = async (selectedChat) => {
    setChatListBlurred(false);
    randomInChat();
    if (selectedChat.recipient) {
      setActiveChat(selectedChat);
      setChatName(selectedChat.recipient.display_name || selectedChat.recipient.name);
      setMobileView('chat');
      setReplyTo(null);
      setEditingMessage(null);
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

  // ── Desktop ESC navigation ────────────────────────────────
  // First ESC: close active chat. Second ESC: blur chat list.
  // Unblur only on mouse click on the chat list.
  const chatListRef = useRef(null);

  useEffect(() => {
    if (isMobile) return;

    const handleEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (profileModal || showEditModal) return;

      if (activeChat) {
        setActiveChat(null);
        setChatName('');
        setMessages([]);
      } else {
        setChatListBlurred(true);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [activeChat, profileModal, showEditModal, isMobile]);

  // ── Mobile slide & swipe ──────────────────────────────────
  const sliderRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(0);   // 0..1 during swipe
  const [isAnimating, setIsAnimating] = useState(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const handleSwipeDrag = useCallback((progress) => {
    setDragOffset(progress);
  }, []);

  const handleSwipeComplete = useCallback(() => {
    setDragOffset(0);
    setMobileView('list');
  }, []);

  const handleSwipeCancel = useCallback(() => {
    setDragOffset(0);
  }, []);

  useEdgeSwipe({
    containerRef: sliderRef,
    enabled: mobileView === 'chat',
    edgeZone: 24,
    threshold: 0.3,
    velocityThreshold: 0.4,
    onDrag: handleSwipeDrag,
    onSwipeComplete: handleSwipeComplete,
    onSwipeCancel: handleSwipeCancel,
  });

  // When mobileView changes, briefly enable transition then clear
  useEffect(() => {
    if (prefersReducedMotion) return;
    setIsAnimating(true);
    const id = setTimeout(() => setIsAnimating(false), 350);
    return () => clearTimeout(id);
  }, [mobileView, prefersReducedMotion]);

  // Compute mobile slider translate: 0% = list visible, -50% = chat visible
  // (the slider itself is 200% wide, so its two w-1/2 halves are each 100vw on
  // mobile; shifting by -50% of the slider's own width = -100vw).
  const mobileTranslateX =
    mobileView === 'chat'
      ? `calc(-50% + ${dragOffset * 50}%)`
      : '0%';

  return (
    <div
      className="flex flex-col h-dvh text-zinc-100 overflow-hidden font-sans"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) / 2)',
        opacity: inTransit ? 0 : 1,
        transform: inTransit ? 'scale(1.04)' : 'scale(1)',
        transition: 'opacity 700ms ease 200ms, transform 900ms cubic-bezier(.4,0,.2,1) 200ms',
        pointerEvents: inTransit ? 'none' : 'auto',
      }}
    >
      <PushPromptModal />

      {/* Desktop: normal flex layout.  Mobile: sliding 200vw container */}
      <div className="relative flex-1 overflow-hidden md:flex">
        <div
          ref={sliderRef}
          className="absolute inset-y-0 left-0 flex md:contents"
          style={{
            width: '200%',
            transform: `translateX(${mobileTranslateX})`,
            transition:
              dragOffset > 0 || prefersReducedMotion
                ? 'none'
                : isAnimating
                  ? 'transform 300ms cubic-bezier(.4,0,.2,1)'
                  : 'none',
            willChange: dragOffset > 0 || isAnimating ? 'transform' : 'auto',
          }}
        >
          {/* Sidebar — takes 50% of the 200vw slider = 100vw on mobile */}
          <div
            ref={chatListRef}
            onClick={() => { if (chatListBlurred) setChatListBlurred(false); }}
            className={`w-1/2 flex flex-col bg-zinc-950 backdrop-blur-xl border-r border-zinc-800/80 md:w-80 md:flex-shrink-0 transition-all duration-300 ${
              chatListBlurred ? 'blur-sm opacity-50 select-none' : ''
            }`}>
            <div className="p-6 border-bottom border-zinc-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleOpenOwnProfile}
                className="group flex items-center gap-3 -mx-2 px-2 py-1 rounded-xl hover:bg-zinc-800/50 active:scale-[0.98] transition-all"
                title="Мой профиль"
              >
                <Avatar
                  url={myProfile?.avatar_thumb_url}
                  initials={(myProfile?.display_name || myProfile?.name || currentUser?.name || "?").slice(0, 1).toUpperCase()}
                  size={40}
                  className="group-hover:ring-2 group-hover:ring-lime-300 transition-all"
                />
                <span className="font-bold text-lg tracking-tight group-hover:text-lime-400 transition-colors">Чаты</span>
              </button>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => navigate('/dashboard')}
                    title="Дашборд основателя"
                    aria-label="Открыть дашборд"
                    className="p-1.5 rounded-lg text-lime-400 hover:bg-zinc-800 transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="9" />
                      <rect x="14" y="3" width="7" height="5" />
                      <rect x="14" y="12" width="7" height="9" />
                      <rect x="3" y="16" width="7" height="5" />
                    </svg>
                  </button>
                )}
                <button onClick={handleLogout} className="text-zinc-500 hover:text-red-400 transition-colors">
                  <LogOut size={20} />
                </button>
              </div>
            </div>

            {!isConnected && (
              <div className="mx-4 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-xs font-medium animate-pulse">
                <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {isConnecting ? 'Подключение к серверу...' : 'Нет соединения. Переподключение...'}
              </div>
            )}

            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                  onChange={(e) => {searchChats(e.target.value); setSearchQuery(e.target.value)}}
                  type="text"
                  placeholder="Поиск чатов..."
                  className="w-full bg-zinc-800/30 border border-zinc-700/60 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-lime-400/50 focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
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

          {/* Chat panel — takes other 50% = 100vw on mobile */}
          <div className="w-1/2 flex flex-col md:flex-1 md:w-auto">
            <ChatWindow activeChat={activeChat}
             messages={messages}
             setMessages={setMessages}
             sendMessage={handleSendMessage}
             isConnected={isConnected}
             isConnecting={isConnecting}
             isPartnerOnline={isPartnerOnline}
             partnerPresencePreference={partnerPresencePreference}
             messagesEndRef={messagesEndRef}
             inputText={inputText}
             setInputText={setInputText}
             chatName={chatName}
             onOpenProfile={() => activeChat?.recipient_id && handleOpenUserProfile(activeChat.recipient_id)}
             onBack={() => setMobileView('list')}
             replyTo={replyTo}
             onReply={handleReply}
             onCancelReply={handleCancelReply}
             onDeleteMessage={handleDeleteMessage}
             editingMessage={editingMessage}
             onEditMessage={handleEditMessage}
             onCancelEdit={handleCancelEdit}
             onConfirmEdit={handleConfirmEdit}
             onPickMedia={handlePickMedia}
             onRetryMedia={handleRetryMedia}
             />
          </div>
        </div>

        {/* Profile view modal — hidden while edit modal is open (edit replaces it) */}
        {profileModal && !showEditModal && (
          <ProfileModal
            profile={profileModal.profile}
            isOwnProfile={profileModal.isOwnProfile}
            onClose={() => setProfileModal(null)}
            onEdit={() => setShowEditModal(true)}
          />
        )}

        {/* Edit profile modal — replaces ProfileModal; closing returns to it */}
        {showEditModal && profileModal && (
          <EditProfileModal
            profile={profileModal.profile}
            onClose={() => setShowEditModal(false)}
            onSave={handleSaveProfile}
          />
        )}

        {/* Media preview before send */}
        {pendingMediaFile && (
          <MediaPreviewModal
            file={pendingMediaFile}
            onCancel={() => setPendingMediaFile(null)}
            onSend={handleSendMedia}
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
