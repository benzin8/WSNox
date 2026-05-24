import { useState, useEffect, useRef } from "react";
import { jwtDecode } from "jwt-decode";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

const RECONNECT_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

export const useChatSocket = (token, activeChatIdRef) => {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [lastReceivedMessage, setLastReceivedMessage] = useState(null);
    const [lastPresenceEvent, setLastPresenceEvent] = useState(null);
    const [lastProfileEvent, setLastProfileEvent] = useState(null);
    const [lastReadReceiptEvent, setLastReadReceiptEvent] = useState(null);

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
                        setMessages((prev) => prev.map((m) =>
                            m.id === data.temp_id
                                ? { ...m, id: data.message_id }
                                : m
                        ));
                    }
                    return;
                }

                if (data.type === "message_deleted") {
                    if (data.chat_id === activeChatIdRef?.current) {
                        setMessages((prev) => prev.filter(m => m.id !== data.message_id));
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
                    }]);
                }
                setLastReceivedMessage(data);
            };

            ws.onclose = (event) => {
                setIsConnected(false);
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

    return {
        messages,
        setMessages,
        sendMessage,
        isConnected,
        lastReceivedMessage,
        lastPresenceEvent,
        lastProfileEvent,
        lastReadReceiptEvent,
        socketRef,
    };
};
