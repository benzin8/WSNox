import { useState, useEffect, useRef } from "react";
import { jwtDecode } from "jwt-decode";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

const RECONNECT_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

export const useChatSocket = (token) => {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [lastReceivedMessage, setLastReceivedMessage] = useState(null);
    const [lastPresenceEvent, setLastPresenceEvent] = useState(null);

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

                setMessages((prev) => [...prev, {
                    ...data,
                    text: data.text,
                    type: data.sender_id === currentUserRef.current ? "outgoing" : "incoming",
                    id: Date.now(),
                }]);
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

    const sendMessage = (text, activeChatId) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                text,
                chat_id: activeChatId,
                timestamp: new Date().toISOString(),
            }));
            setLastReceivedMessage({
                chat_id: activeChatId,
                text,
                sender_id: currentUserRef.current,
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
        socketRef,
    };
};
