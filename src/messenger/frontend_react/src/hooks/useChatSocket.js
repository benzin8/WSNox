import { useState, useEffect, useRef, useCallback } from "react";
import { jwtDecode } from "jwt-decode";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL;

export const useChatSocket = (token) => {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef(null);

    useEffect(() => {
        if (!token) return;

        try {
            const decoded = jwtDecode(token);
            const userId = decoded.sub || decoded.user_id; 
            const wsUrl = `${WS_BASE}/chat/${userId}`;

            const ws = new WebSocket(wsUrl)
            socketRef.current = ws

            ws.onopen = () => setIsConnected(true);

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                setMessages((prev) => [...prev, {
                    ...data, 
                    text: data.text,
                    type: data.sender_id === userId ? "outgoing" : "incoming",
                    id: Date.now()
                }]);
                console.log("Message received:", data);
            };
            ws.onclose = () => setIsConnected(false);
            
            return () => ws.close();
        } catch (err) {
            console.error('Socket connection error:', err);
        }
    }, [token]);

    const sendMessage = useCallback((text, activeChatId, recipientId) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            console.log("Sending message:", text, activeChatId, recipientId);
            const payload = {
                text: text, 
                chat_id: activeChatId,
                recipient_id: recipientId,
                timestamp: new Date().toISOString()
            }
            socketRef.current.send(JSON.stringify(payload))
        }
    }, [])

    return { messages, setMessages, sendMessage, isConnected };
};