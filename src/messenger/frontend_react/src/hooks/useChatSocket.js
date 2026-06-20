import { useState, useEffect, useRef } from "react";
import { jwtDecode } from "jwt-decode";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

const RECONNECT_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

export const useChatSocket = (token, activeChatIdRef) => {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [lastReceivedMessage, setLastReceivedMessage] = useState(null);
    const [lastPresenceEvent, setLastPresenceEvent] = useState(null);
    const [lastProfileEvent, setLastProfileEvent] = useState(null);
    const [lastReadReceiptEvent, setLastReadReceiptEvent] = useState(null);
    const [lastChatEvent, setLastChatEvent] = useState(null);

    const currentUserRef = useRef(null);
    const socketRef = useRef(null);
    const manualCloseRef = useRef(false);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef(null);

    useEffect(() => {
        if (!token) return;

        let cancelled = false;

        const openSocket = () => {
            if (cancelled) return;
            try {
                const decoded = jwtDecode(token);
                currentUserRef.current = decoded.sub || decoded.user_id;
            } catch (err) {
                console.error('JWT decode failed', err);
                return;
            }

            setIsConnecting(true);
            const ws = new WebSocket(`${WS_BASE}/chat`);
            socketRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: "auth", token }));
            };

            ws.onmessage = (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (data.type === "auth_ok") {
                    setIsConnected(true);
                    setIsConnecting(false);
                    reconnectAttemptRef.current = 0;
                    return;
                }

                if (data.type === "presence") {
                    setLastPresenceEvent(data);
                    return;
                }

                if (data.type === "profile_update") {
                    setLastProfileEvent(data);
                    return;
                }

                if (data.type === "messages_read") {
                    setLastReadReceiptEvent(data);
                    // Update read_at on outgoing messages in the active chat.
                    // We compare by created_at, not id — locally sent messages
                    // use `Date.now()` as a placeholder id, which doesn't line
                    // up with the server's DB ids in `up_to_message_id`.
                    if (data.chat_id === activeChatIdRef?.current && data.read_at) {
                        setMessages((prev) => prev.map((msg) =>
                            msg.type === 'outgoing'
                            && msg.created_at
                            && msg.created_at <= data.read_at
                            && !msg.read_at
                                ? { ...msg, read_at: data.read_at }
                                : msg
                        ));
                    }
                    return;
                }

                if (data.type === "message_ack") {
                    if (data.temp_id != null) {
                        setMessages((prev) => prev.map((m) => {
                            if (m.id !== data.temp_id) return m;
                            const next = {
                                ...m,
                                id: data.message_id,
                                client_status: "sent",
                                upload_progress: undefined,
                            };
                            // Media uploads include presigned URLs in the ack so
                            // the local blob URL can be swapped for the real one
                            // even when the HTTP response is lost.
                            if (data.attachment_url !== undefined) {
                                next.attachment_url = data.attachment_url;
                            }
                            if (data.attachment_thumb_url !== undefined) {
                                next.attachment_thumb_url = data.attachment_thumb_url
                                    || data.attachment_url
                                    || next.attachment_thumb_url;
                            }
                            if (data.attachment_meta !== undefined) {
                                next.attachment_meta = data.attachment_meta || next.attachment_meta;
                            }
                            return next;
                        }));
                    }
                    return;
                }

                if (data.type === "message_deleted") {
                    if (data.chat_id === activeChatIdRef?.current) {
                        setMessages((prev) => prev.filter(m => m.id !== data.message_id));
                    }
                    return;
                }

                if (
                    data.type === "group_created"
                    || data.type === "group_member_left"
                    || data.type === "group_members_added"
                    || data.type === "group_deleted"
                ) {
                    setLastChatEvent(data);
                    return;
                }

                if (data.type === "message_edited") {
                    if (data.chat_id === activeChatIdRef?.current) {
                        setMessages((prev) => prev.map((m) =>
                            m.id === data.message_id
                                ? { ...m, text: data.text, edited_at: data.edited_at }
                                : m
                        ));
                    }
                    return;
                }

                if (data.type === "reaction_update") {
                    if (data.chat_id === activeChatIdRef?.current) {
                        setMessages((prev) => prev.map((m) => {
                            if (m.id !== data.message_id) return m;
                            // Counts apply to everyone; "my" state only changes
                            // for the actor (keeps it correct across the actor's
                            // own tabs and untouched for everyone else).
                            const mine = data.actor_id === currentUserRef.current;
                            const prevR = m.reactions || {};
                            return {
                                ...m,
                                reactions: {
                                    emoji: data.emoji || {},
                                    aura: data.aura || 0,
                                    my_emoji: mine ? (data.actor_emoji ?? null) : (prevR.my_emoji ?? null),
                                    my_aura: mine ? !!data.actor_aura : (prevR.my_aura ?? false),
                                },
                            };
                        }));
                    }
                    return;
                }

                if (data.chat_id === activeChatIdRef?.current) {
                    setMessages((prev) => [...prev, {
                        ...data,
                        text: data.text,
                        type: data.sender_id === currentUserRef.current ? "outgoing" : "incoming",
                        id: data.message_id || Date.now(),
                        reply_to_id: data.reply_to_id || null,
                        reply_to_text: data.reply_to_text || null,
                        // Carry sender info & msg_type so group bubbles can
                        // render the author label + avatar without an extra fetch.
                        sender_display_name: data.sender_display_name || null,
                        sender_avatar_url: data.sender_avatar_url || null,
                        msg_type: data.msg_type || "text",
                    }]);
                }
                setLastReceivedMessage(data);
            };

            ws.onclose = (event) => {
                setIsConnected(false);
                setIsConnecting(false);
                if (cancelled || manualCloseRef.current) return;
                if (event.code === 4401) return;  // auth failed — don't loop forever

                const attempt = reconnectAttemptRef.current;
                const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
                reconnectAttemptRef.current = attempt + 1;
                reconnectTimerRef.current = setTimeout(openSocket, delay);
            };

            ws.onerror = () => {
                // Let onclose handle reconnect.
            };
        };

        openSocket();

        return () => {
            cancelled = true;
            manualCloseRef.current = true;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (socketRef.current) socketRef.current.close();
        };
    }, [token]);

    const sendMessage = (text, activeChatId, replyToId = null, tempId = null) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            const payload = {
                text,
                chat_id: activeChatId,
                timestamp: new Date().toISOString(),
            };
            if (replyToId) payload.reply_to_id = replyToId;
            if (tempId != null) payload.temp_id = tempId;
            socketRef.current.send(JSON.stringify(payload));
            setLastReceivedMessage({
                chat_id: activeChatId,
                text,
                sender_id: currentUserRef.current,
                created_at: new Date().toISOString(),
            });
        }
    };

    const editMessage = (messageId, chatId, newText) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                type: "edit_message",
                message_id: messageId,
                chat_id: chatId,
                text: newText,
            }));
        }
    };

    // Toggle a reaction. reactType "emoji" needs an emoji; "aura" ignores it.
    // The server is authoritative — it broadcasts reaction_update back.
    const react = (messageId, chatId, reactType, emoji = null) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                type: "react",
                message_id: messageId,
                chat_id: chatId,
                react_type: reactType,
                emoji,
            }));
        }
    };

    // Optimistically surface a message the local user just sent, so the chat
    // list preview + reorder updates immediately. `sendMessage` does this inline
    // for text; media/voice go out over HTTP (handleSendMedia) and never round-
    // trip back to the sender, so they call this to get the same sender-side
    // chat-list update. Only sets state — the bubble itself is inserted by the
    // caller's optimistic setMessages. The preview label is derived from msgType.
    const signalLocalSend = ({ chatId, text = '', msgType = 'text' }) => {
        setLastReceivedMessage({
            chat_id: chatId,
            text,
            msg_type: msgType,
            sender_id: currentUserRef.current,
            created_at: new Date().toISOString(),
        });
    };

    return {
        messages,
        setMessages,
        sendMessage,
        signalLocalSend,
        editMessage,
        react,
        isConnected,
        isConnecting,
        lastReceivedMessage,
        lastPresenceEvent,
        lastProfileEvent,
        lastReadReceiptEvent,
        lastChatEvent,
        socketRef,
    };
};
