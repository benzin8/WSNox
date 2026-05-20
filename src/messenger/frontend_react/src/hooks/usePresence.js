import { useEffect, useRef, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const HEARTBEAT_INTERVAL_MS = 30_000;

const authConfig = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
});

/**
 * Tracks which chat partners are currently online.
 *
 * @param {{current: WebSocket | null}} socketRef — from useChatSocket.
 * @param {boolean} isConnected — true after auth_ok.
 * @param {{type: string, user_id: number, online: boolean} | null} lastPresenceEvent
 * @returns {{onlineUsers: Set<number>}}
 */
export const usePresence = (socketRef, isConnected, lastPresenceEvent) => {
    const [onlineUsers, setOnlineUsers] = useState(() => new Set());
    const heartbeatRef = useRef(null);

    const startHeartbeat = () => {
        if (heartbeatRef.current) return;
        const sendPing = () => {
            const ws = socketRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ping" }));
            }
        };
        sendPing();  // immediate ping on (re)start
        heartbeatRef.current = setInterval(sendPing, HEARTBEAT_INTERVAL_MS);
    };

    const stopHeartbeat = () => {
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }
    };

    // Fetch initial snapshot and start heartbeat after auth_ok.
    useEffect(() => {
        if (!isConnected) {
            stopHeartbeat();
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const res = await axios.get(`${API_BASE}/chats/presence`, authConfig());
                if (!cancelled) setOnlineUsers(new Set(res.data.online_user_ids));
            } catch (err) {
                console.error("Failed to load presence snapshot", err);
            }
        })();

        if (document.visibilityState === "visible") startHeartbeat();

        return () => {
            cancelled = true;
            stopHeartbeat();
        };
    }, [isConnected]);

    // Page Visibility — start/stop heartbeat only; server figures out the rest via TTL.
    useEffect(() => {
        const onChange = () => {
            if (!isConnected) return;
            if (document.visibilityState === "visible") {
                startHeartbeat();
            } else {
                stopHeartbeat();
            }
        };
        document.addEventListener("visibilitychange", onChange);
        return () => document.removeEventListener("visibilitychange", onChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected]);

    // Apply presence events from the WS.
    useEffect(() => {
        if (!lastPresenceEvent) return;
        const { user_id, online } = lastPresenceEvent;
        setOnlineUsers((prev) => {
            const next = new Set(prev);
            if (online) next.add(user_id);
            else next.delete(user_id);
            return next;
        });
    }, [lastPresenceEvent]);

    return { onlineUsers };
};
