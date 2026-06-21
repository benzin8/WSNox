import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { User, Search, Megaphone } from 'lucide-react';
import { useChatAction } from '../../hooks/useChatAction';
import { useChatSocket } from '../../hooks/useChatSocket';
import { usePresence } from '../../hooks/usePresence';
import { useProfile } from '../../hooks/useProfile';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { useEdgeSwipe } from '../../hooks/useEdgeSwipe';
import { useEnergy } from '../../features/energy';

import { ChatWindow } from '../../components/chat/ChatWindow';
import { ChatList } from '../../components/chat/ChatList';
import { CreateGroupModal } from '../../components/chat/CreateGroupModal';
import { CreateChannelModal } from '../../components/chat/CreateChannelModal';
import { ChatInfoModal } from '../../components/chat/ChatInfoModal';
import { GroupInfoModal } from '../../components/chat/GroupInfoModal';
import { MediaPreviewModal } from '../../components/chat/MediaPreviewModal';
import { ProfileModal } from '../../components/profile/ProfileModal';
import { EditProfileModal } from '../../components/profile/EditProfileModal';
import { SidebarHeader } from '../../components/chat/SidebarHeader';
import { beginAddAccount, removeAccount, getActiveId, seedCurrentAccount } from '../../features/accounts/accountStore';
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
  const [editInitialTab, setEditInitialTab] = useState("profile");
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

  const { messages, setMessages, sendMessage, signalLocalSend, editMessage, react, isConnected, isConnecting, lastReceivedMessage, lastPresenceEvent, lastProfileEvent, lastChatEvent, socketRef } = useChatSocket(token, activeChatIdRef);
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
          searchChannelResult,
          isSearching,
          getOrCreateChats,
          activeChat,
          setActiveChat,
          getUserDataByChatId,
          getMyData,
          getMessagesByChatId,
          getAllChats,
          markChatAsRead,
          createGroupChat,
          createChannel,
          subscribeChannel,
          joinChannelByToken,
          getChatMedia,
          searchChatMessages,
          getChatMembers,
          addGroupMembers,
          leaveGroupChat,
          deleteChat,
  } = useChatAction();
  const { fetchMyProfile, fetchUserProfile, updateMyProfile } = useProfile();
  const { canViewDashboard } = useIsAdmin();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  // Tracks what we last auto-scrolled for, so in-place updates (reactions,
  // edits, read receipts) that rebuild the messages array don't yank the
  // view to the bottom.
  const scrollAnchorRef = useRef({ chatId: null, len: 0 });
  const { orb, settleInChat, randomInChat } = useEnergy();
  const inTransit = orb.phase === 'transit';

  useEffect(() => {
    const t = setTimeout(() => settleInChat(), 0);
    return () => clearTimeout(t);
  }, [settleInChat]);


  // Auto-scroll only when the chat opens or a new message is appended — NOT
  // on in-place updates (a reaction/edit/read rebuilds the array but must not
  // jump the view). Skip when the chat panel is offscreen on mobile —
  // scrollIntoView on a transform-translated, hidden element can drag
  // the layout viewport sideways on iOS Safari and break the slider.
  useEffect(() => {
    if (isMobile && mobileView !== 'chat') return;
    const prev = scrollAnchorRef.current;
    const chatChanged = activeChat?.id !== prev.chatId;
    const appended = activeChat?.id === prev.chatId && messages.length > prev.len;
    scrollAnchorRef.current = { chatId: activeChat?.id, len: messages.length };
    if (chatChanged || appended) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, mobileView, isMobile, activeChat?.id]);

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
      // Migrate a pre-multi-account session into the account store so it
      // isn't lost when a second account is added.
      if (profile) {
        seedCurrentAccount({
          user_id: profile.user_id,
          display_name: profile.display_name || profile.name,
          avatar_url: profile.avatar_thumb_url,
        });
      }
      // Redeem a channel invite link (/join/:token) once we're authenticated
      // and the chat list is loaded — works for both already-logged-in users
      // and those who had to authenticate first.
      const pendingJoin = localStorage.getItem('pending_join_channel');
      if (pendingJoin) {
        localStorage.removeItem('pending_join_channel');
        const joined = await joinChannelByToken(pendingJoin);
        if (joined) {
          const refreshed = await getAllChats();
          setChats(refreshed);
          const opened = refreshed.find((c) => c.id === joined.id) || joined;
          setActiveChat(opened);
          setChatName(opened.name || 'Канал');
          setMobileView('chat');
        }
      }
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
        // Media without caption — show a short label instead of "" so the
        // preview doesn't collapse into "Нет сообщений" on the live update.
        let previewText = lastReceivedMessage.text;
        if (!previewText && lastReceivedMessage.msg_type === "image") previewText = "📷 Фото";
        else if (!previewText && lastReceivedMessage.msg_type === "video") previewText = "🎥 Видео";
        else if (!previewText && lastReceivedMessage.msg_type === "voice") previewText = "🎤 Голосовое сообщение";
        const updatedChat = {
          ...prevChats[idx],
          last_message: previewText,
          last_message_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_sender_id: lastReceivedMessage.sender_id,
          last_sender_display_name: lastReceivedMessage.sender_display_name,
          unread_count: (!isViewing && !isOwnMessage)
            ? (prevChats[idx].unread_count || 0) + 1
            : prevChats[idx].unread_count || 0,
        };
        return [updatedChat, ...prevChats.filter(c => c.id !== lastReceivedMessage.chat_id)];
      });
    } else if (lastReceivedMessage.chat_info) {
      setChats(prevChats => {
        if (prevChats.some(c => c.id === lastReceivedMessage.chat_info.id)) return prevChats;
        const t = lastReceivedMessage.msg_type;
        const newChat = {
          ...lastReceivedMessage.chat_info,
          last_message: lastReceivedMessage.text
            || (t === "image" ? "📷 Фото" : t === "video" ? "🎥 Видео" : t === "voice" ? "🎤 Голосовое сообщение" : ""),
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
      // Wipe the previous chat's messages immediately so the user never
      // sees stale content while the new fetch is in flight (otherwise
      // switching from chat A to chat B would briefly show A's bubbles).
      setMessages([]);
      const fetchMessages = async () => {
        const msgs = await getMessagesByChatId(activeChat.id);
        if (!msgs) return;
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
            sender_id: currentUser?.id,
            sender_display_name: myProfile?.display_name || currentUser?.name || null,
            created_at: new Date().toISOString(),
            reply_to_id: replyMsg?.id ?? null,
            reply_to_text: replyMsg?.text ?? null,
            reply_to_msg_type: replyMsg?.msg_type ?? null,
            client_status: 'pending',
        }]);
  }

  // ── group chats ────────────────────────────────────────────────────
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupCandidates, setGroupCandidates] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [chatInfoOpen, setChatInfoOpen] = useState(false);

  const handleOpenCreateGroup = useCallback(() => {
    // Candidates = current private chats' counterparts. The backend rejects
    // anyone the user has no existing chat with, so list only those here.
    const cands = (chatsRef.current || [])
      .filter((c) => c.chat_type === "private" && c.recipient)
      .map((c) => ({
        id: c.recipient.id,
        name: c.recipient.name,
        username: c.recipient.username,
        display_name: c.recipient.display_name,
        avatar_thumb_url: c.recipient.avatar_thumb_url,
      }));
    setGroupCandidates(cands);
    setShowCreateGroup(true);
  }, []);

  const handleCreateGroup = useCallback(async (name, memberIds) => {
    setCreatingGroup(true);
    const chat = await createGroupChat(name, memberIds);
    setCreatingGroup(false);
    if (!chat) return;
    setShowCreateGroup(false);
    const updated = await getAllChats();
    setChats(updated);
    const created = updated.find((c) => c.id === chat.id) || chat;
    setActiveChat(created);
    setChatName(created.name || "Группа");
    setMobileView('chat');
    setReplyTo(null);
    setEditingMessage(null);
    setMessages([]);
  }, [createGroupChat, getAllChats, setActiveChat, setMessages]);

  const handleOpenCreateChannel = useCallback(() => {
    setShowCreateChannel(true);
  }, []);

  const handleCreateChannel = useCallback(async (name, description) => {
    setCreatingChannel(true);
    const channel = await createChannel(name, description);
    setCreatingChannel(false);
    if (!channel) return;
    setShowCreateChannel(false);
    const updated = await getAllChats();
    setChats(updated);
    const created = updated.find((c) => c.id === channel.id) || channel;
    setActiveChat(created);
    setChatName(created.name || "Канал");
    setMobileView('chat');
    setReplyTo(null);
    setEditingMessage(null);
    setMessages([]);
  }, [createChannel, getAllChats, setActiveChat, setMessages]);

  // Subscribe to a channel found in search, then open it.
  const handleSubscribeChannel = useCallback(async (channel) => {
    const res = await subscribeChannel(channel.id);
    const joined = res || channel;
    const updated = await getAllChats();
    setChats(updated);
    const opened = updated.find((c) => c.id === joined.id) || joined;
    setActiveChat(opened);
    setChatName(opened.name || "Канал");
    setSearchQuery('');
    setMobileView('chat');
    setReplyTo(null);
    setEditingMessage(null);
    setMessages([]);
  }, [subscribeChannel, getAllChats, setActiveChat, setMessages]);

  // Jump to a message found via in-chat search: close the gallery and flash the
  // bubble if it's in the loaded window (older messages may not be mounted yet).
  const handleJumpToMessage = useCallback((id) => {
    setChatInfoOpen(false);
    setMobileView('chat');
    setTimeout(() => {
      const el = document.getElementById(`msg-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('message-flash');
      void el.offsetWidth;
      el.classList.add('message-flash');
      setTimeout(() => el.classList.remove('message-flash'), 1600);
    }, 80);
  }, []);

  const handleLeaveGroup = useCallback(async () => {
    if (!activeChat || activeChat.chat_type !== "group") return;
    const ok = window.confirm(`Покинуть группу "${activeChat.name}"?`);
    if (!ok) return;
    const success = await leaveGroupChat(activeChat.id);
    if (success) {
      setChats((prev) => prev.filter((c) => c.id !== activeChat.id));
      setActiveChat(null);
      setMessages([]);
      setMobileView('list');
    }
  }, [activeChat, leaveGroupChat, setActiveChat, setMessages]);

  // Group info modal: list members + add-member flow.
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState(null);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupAdding, setGroupAdding] = useState(false);

  const loadGroupMembers = useCallback(async (chatId) => {
    setGroupMembersLoading(true);
    const data = await getChatMembers(chatId);
    setGroupMembersLoading(false);
    setGroupMembers(data?.members || []);
  }, [getChatMembers]);

  const handleOpenGroupInfo = useCallback(() => {
    if (!activeChat || activeChat.chat_type !== "group") return;
    setGroupInfoOpen(true);
    setGroupMembers(null);
    loadGroupMembers(activeChat.id);
  }, [activeChat, loadGroupMembers]);

  const handleAddGroupMembers = useCallback(async (memberIds) => {
    if (!activeChat || activeChat.chat_type !== "group") return;
    setGroupAdding(true);
    const data = await addGroupMembers(activeChat.id, memberIds);
    setGroupAdding(false);
    if (data) {
      setGroupMembers(data.members || []);
      // Member count on the active chat header should reflect the new size.
      setActiveChat((prev) => prev ? { ...prev, member_count: (data.members || []).length } : prev);
      setChats((prev) => prev.map((c) =>
        c.id === activeChat.id ? { ...c, member_count: (data.members || []).length } : c,
      ));
    }
  }, [activeChat, addGroupMembers, setActiveChat]);

  const isGroupAdmin = activeChat?.chat_type === "group"
    && (groupMembers || []).some((m) => m.user_id === currentUser?.id && m.role === "admin");

  const handleDeleteGroup = useCallback(async () => {
    if (!activeChat || activeChat.chat_type !== "group") return;
    const ok = window.confirm(`Удалить группу "${activeChat.name}"? Это действие необратимо.`);
    if (!ok) return;
    const success = await deleteChat(activeChat.id);
    if (success) {
      setChats((prev) => prev.filter((c) => c.id !== activeChat.id));
      setActiveChat(null);
      setMessages([]);
      setMobileView('list');
    }
  }, [activeChat, deleteChat, setActiveChat, setMessages]);

  // React to group lifecycle events fan-out via WS so the chat list keeps
  // up to date even when WE didn't initiate the change (another member
  // created the group, the admin deleted it, etc.).
  useEffect(() => {
    if (!lastChatEvent) return;
    if (lastChatEvent.type === "group_created" || lastChatEvent.type === "group_members_added") {
      // Someone added us to a new group, or we got added to an existing one —
      // refetch the list so the chat shows up / member_count updates.
      getAllChats().then((updated) => setChats(updated));
    } else if (lastChatEvent.type === "group_deleted") {
      setChats((prev) => prev.filter((c) => c.id !== lastChatEvent.chat_id));
      if (activeChatIdRef.current === lastChatEvent.chat_id) {
        setActiveChat(null);
        setMessages([]);
        setMobileView('list');
      }
    } else if (lastChatEvent.type === "group_member_left") {
      // Only relevant if we have the chat open and the leaver was us
      // (everyone else updates only when they re-open the members screen,
      // which is a roadmap iteration). For MVP just refetch the list.
      getAllChats().then((updated) => setChats(updated));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastChatEvent]);

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
    const msgType = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('audio/')
      ? 'voice'
      : 'video';

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

    // Mirror the text path: surface this send to the chat list immediately so
    // the sidebar preview + ordering update for the sender. Media/voice never
    // round-trip back to the sender (excluded from the WS fan-out, only a bare
    // message_ack comes back), so without this their own send stays invisible
    // in the chat list. The preview label ("🎤 Голосовое сообщение" etc.) is
    // derived from msgType by the lastReceivedMessage effect.
    signalLocalSend({ chatId: activeChat.id, text: caption || '', msgType });

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
      // The upload's HTTP response can be lost (proxy/tunnel timeout, flaky
      // mobile link) even though the server stored the message and emitted a
      // WS `message_ack`. Give the ack a moment to reconcile; if the message
      // is still optimistic, VERIFY against the server before showing a red
      // "failed" — a delivered media message must never look unsent.
      setTimeout(async () => {
        let fresh = null;
        try { fresh = await getMessagesByChatId(activeChat.id); } catch { /* offline */ }
        setMessages((prev) => {
          if (!prev.some((m) => m.id === tempId)) return prev; // WS ack already reconciled → sent
          const known = new Set(prev.map((m) => m.id));
          const landed = (fresh || [])
            .filter((m) => m.sender_id === currentUser?.id
                        && m.msg_type === msgType
                        && !known.has(m.id))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
          if (landed) {
            if (landed.attachment_url) { try { URL.revokeObjectURL(localUrl); } catch { /* noop */ } }
            return prev.map((m) => m.id === tempId ? {
              ...m,
              id: landed.id,
              attachment_url: landed.attachment_url || m.attachment_url,
              attachment_thumb_url: landed.attachment_thumb_url || landed.attachment_url || m.attachment_thumb_url,
              attachment_meta: landed.attachment_meta || m.attachment_meta,
              client_status: 'sent',
              upload_progress: undefined,
              _retry_file: undefined, _retry_caption: undefined, _retry_meta: undefined,
            } : m);
          }
          return prev.map((m) => m.id === tempId ? { ...m, client_status: 'failed' } : m);
        });
      }, 3000);
    }
  }, [activeChat?.id, setMessages, uploadMediaToChat, getMessagesByChatId, currentUser?.id, signalLocalSend]);

  const handleRetryMedia = useCallback((msg) => {
    if (!msg?._retry_file) return;
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    handleSendMedia(msg._retry_file, msg._retry_caption || '', msg._retry_meta || null);
  }, [handleSendMedia, setMessages]);

  // Voice notes reuse the media upload path — they're just an audio file with
  // a {duration_ms} meta and no caption. The backend tags them msg_type=voice.
  const handleSendVoice = useCallback((file, meta) => {
    handleSendMedia(file, '', meta || null);
  }, [handleSendMedia]);

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

  const handleReact = useCallback((message, reactType, emoji) => {
    if (!activeChat?.id || !message?.id) return;
    react(message.id, activeChat.id, reactType, emoji);
    // The aura boost is WSNox's "energy" reaction — give the background orb a
    // little kick so the act visibly energizes the chat.
    if (reactType === "aura") randomInChat();
  }, [activeChat?.id, react, randomInChat]);

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
    const activeId = getActiveId();
    if (activeId != null) {
      removeAccount(activeId, navigate);
    } else {
      // Pre-multi-account fallback: no store entry, clear legacy keys.
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      navigate('/auth/send-code');
    }
  };

  // Выбор чата
  const handleSelectChat = async (selectedChat) => {
    setChatListBlurred(false);
    randomInChat();
    if (selectedChat.chat_type === "group" || selectedChat.chat_type === "channel") {
      setActiveChat(selectedChat);
      setChatName(selectedChat.name || (selectedChat.chat_type === "channel" ? "WSNox" : "Группа"));
      setMobileView('chat');
      setReplyTo(null);
      setEditingMessage(null);
      setChats(prevChats => prevChats.map(c =>
        c.id === selectedChat.id ? { ...c, unread_count: 0 } : c
      ));
    } else if (selectedChat.recipient) {
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

      {/* Solid chrome over the notch / home-indicator safe areas. The root's
          safe-area padding is transparent, so the ambient energy orb was
          bleeding green through those top/bottom strips. Portaled to <body>
          so it's viewport-anchored (the root has a transform) and sits above
          the orb but below menus/modals. */}
      {createPortal(
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-0 z-[40]"
            style={{ height: 'env(safe-area-inset-top)', background: 'var(--color-zinc-950)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[40]"
            style={{ height: 'calc(env(safe-area-inset-bottom) / 2)', background: 'var(--color-zinc-950)' }}
          />
        </>,
        document.body,
      )}

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
            <SidebarHeader
              myProfile={myProfile}
              isAdmin={canViewDashboard}
              onOpenOwnProfile={handleOpenOwnProfile}
              onOpenEditProfile={async (tab = "profile") => {
                await handleOpenOwnProfile();
                setEditInitialTab(tab);
                setShowEditModal(true);
              }}
              onOpenCreateGroup={handleOpenCreateGroup}
              onOpenCreateChannel={handleOpenCreateChannel}
              onOpenDashboard={() => navigate('/dashboard')}
              onOpenLanding={() => navigate('/landing')}
              onAddAccount={() => { beginAddAccount(); navigate('/auth/send-code'); }}
              onLogout={handleLogout}
            />

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
                  {searchResult?.map((user) => (
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
                  ))}

                  {searchChannelResult?.length > 0 && (
                    <>
                      <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                        Каналы
                      </div>
                      {searchChannelResult.map((ch) => (
                        <div key={ch.id} onClick={() => handleSubscribeChannel(ch)}
                          className="flex items-center gap-3 p-3 rounded-xl bg-violet-400/5 border border-violet-400/20 cursor-pointer hover:bg-violet-400/10 transition-all group">
                          <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center group-hover:border-violet-400/50 shrink-0">
                            <Megaphone size={22} className="text-zinc-400 group-hover:text-violet-300" />
                          </div>
                          <div className="flex-grow min-w-0">
                            <h4 className="font-semibold text-zinc-100 truncate">{ch.name}</h4>
                            <p className="text-xs text-zinc-500 truncate">
                              {ch.description || `${ch.member_count || 0} подписчиков`}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-violet-300">
                            {ch.is_owner ? "Открыть" : "Подписаться"}
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  {!isSearching && !searchResult?.length && !searchChannelResult?.length && (
                    <div className="p-4 text-center text-zinc-500 text-sm">
                      Ничего не найдено по запросу "{searchQuery}"
                    </div>
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
             onOpenProfile={() => {
               if (activeChat?.chat_type === "group") {
                 handleOpenGroupInfo();
               } else if (activeChat?.recipient_id) {
                 handleOpenUserProfile(activeChat.recipient_id);
               }
             }}
             onOpenChatInfo={() => setChatInfoOpen(true)}
             onBack={() => setMobileView('list')}
             replyTo={replyTo}
             onReply={handleReply}
             onReact={handleReact}
             onCancelReply={handleCancelReply}
             onDeleteMessage={handleDeleteMessage}
             editingMessage={editingMessage}
             onEditMessage={handleEditMessage}
             onCancelEdit={handleCancelEdit}
             onConfirmEdit={handleConfirmEdit}
             onPickMedia={handlePickMedia}
             onSendVoice={handleSendVoice}
             onRetryMedia={handleRetryMedia}
             onLeaveGroup={handleLeaveGroup}
             onDeleteGroup={isGroupAdmin ? handleDeleteGroup : null}
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
            onAddAccount={() => { beginAddAccount(); navigate('/auth/send-code'); }}
          />
        )}

        {/* Edit profile modal — replaces ProfileModal; closing returns to it */}
        {showEditModal && profileModal && (
          <EditProfileModal
            profile={profileModal.profile}
            initialTab={editInitialTab}
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

        {/* Group creation modal */}
        {showCreateGroup && (
          <CreateGroupModal
            candidates={groupCandidates}
            isSubmitting={creatingGroup}
            onCancel={() => setShowCreateGroup(false)}
            onCreate={handleCreateGroup}
          />
        )}

        {/* Channel creation modal */}
        {showCreateChannel && (
          <CreateChannelModal
            isSubmitting={creatingChannel}
            onCancel={() => setShowCreateChannel(false)}
            onCreate={handleCreateChannel}
          />
        )}

        {/* Chat media gallery (+ search, later) — opens on header tap */}
        {chatInfoOpen && activeChat && (
          <ChatInfoModal
            chat={activeChat}
            chatName={chatName}
            isGroup={activeChat.chat_type === "group"}
            isChannel={activeChat.chat_type === "channel"}
            recipientId={activeChat.recipient_id}
            getChatMedia={getChatMedia}
            searchChatMessages={searchChatMessages}
            fetchUserProfile={fetchUserProfile}
            getChatMembers={getChatMembers}
            onJumpToMessage={handleJumpToMessage}
            onClose={() => setChatInfoOpen(false)}
            onOpenMembers={
              activeChat.chat_type === "group"
                ? () => { setChatInfoOpen(false); handleOpenGroupInfo(); }
                : undefined
            }
          />
        )}

        {/* Group info / add members modal */}
        {groupInfoOpen && activeChat?.chat_type === "group" && (
          <GroupInfoModal
            chat={activeChat}
            members={groupMembers}
            isLoading={groupMembersLoading}
            candidates={(chatsRef.current || [])
              .filter((c) => c.chat_type === "private" && c.recipient)
              .map((c) => ({
                id: c.recipient.id,
                name: c.recipient.name,
                username: c.recipient.username,
                display_name: c.recipient.display_name,
                avatar_thumb_url: c.recipient.avatar_thumb_url,
              }))}
            isAdmin={isGroupAdmin}
            isAdding={groupAdding}
            onCancel={() => setGroupInfoOpen(false)}
            onAdd={handleAddGroupMembers}
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
