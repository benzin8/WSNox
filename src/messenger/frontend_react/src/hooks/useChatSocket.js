import { useState, useEffect, useRef } from "react";
import { jwtDecode } from "jwt-decode";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

export const useChatSocket = (token) => {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const currentUserRef = useRef(null);
    const [lastReceivedMessage, setLastReceivedMessage] = useState(null);
    const socketRef = useRef(null);

    useEffect(() => {
        if (!token) return;

        try {
            // Decoded only for display (matching outgoing/incoming).
            // The server never trusts this value — it derives user_id from the JWT itself.
            const decoded = jwtDecode(token);
            currentUserRef.current = decoded.sub || decoded.user_id;

            const ws = new WebSocket(`${WS_BASE}/chat`);
            socketRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: "auth", token }));
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === "auth_ok") {
                    setIsConnected(true);
                    return;
                }

                setMessages((prev) => [...prev, {
                    ...data,
                    text: data.text,
                    type: data.sender_id === currentUserRef.current ? "outgoing" : "incoming",
                    id: Date.now()
                }]);
                setLastReceivedMessage(data);
            };
            ws.onclose = () => setIsConnected(false);

            return () => ws.close();
        } catch (err) {
            console.error('Socket connection error:', err);
        }
    }, [token]);

    const sendMessage = (text, activeChatId) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            const payload = {
                text,
                chat_id: activeChatId,
                timestamp: new Date().toISOString()
            };
            socketRef.current.send(JSON.stringify(payload));

            setLastReceivedMessage({
                chat_id: activeChatId,
                text,
                sender_id: currentUserRef.current
            });
        }
    };

    return { messages, setMessages, sendMessage, isConnected, lastReceivedMessage };
};
