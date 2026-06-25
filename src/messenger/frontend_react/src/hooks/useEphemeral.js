import { useCallback, useEffect, useRef, useState } from "react";

// How long after the tab is hidden (minimised / switched away) before a live
// one-time chat self-destructs. 0 = immediately, per the "secret chat" intent.
// Bump this (e.g. 3000) for a softer grace period.
const HIDE_GRACE_MS = 0;
// Self-destruct animation length — keep in sync with the CSS .animate-ephDestruct.
const DESTRUCT_MS = 750;

let _tmp = 0;
const tempId = () => `eph-${Date.now()}-${_tmp++}`;

/**
 * Drives one-time (ephemeral) chats on the client. Messages live ONLY here in
 * component state and are wiped the instant the chat ends. Rides the existing
 * chat WebSocket via the senders/lastEphEvent passed in from useChatSocket.
 */
export function useEphemeral({
    currentUser,
    lastEphEvent,
    setLastEphEvent,
    ephInvite,
    ephAccept,
    ephDecline,
    ephSend,
    ephTyping,
    ephLeave,
}) {
    const [incomingInvite, setIncomingInvite] = useState(null); // {ephId, fromId, fromName, fromAvatar}
    const [waiting, setWaiting] = useState(null);               // {ephId?, toId, toName}
    const [session, setSession] = useState(null);              // {ephId, peer, status}
    const [messages, setMessages] = useState([]);
    const [peerTyping, setPeerTyping] = useState(false);
    const [toast, setToast] = useState(null);                  // transient notice {kind, text}

    const sessionRef = useRef(null);
    sessionRef.current = session;
    const typingTimer = useRef(null);
    const destructTimer = useRef(null);
    const hideTimer = useRef(null);

    const myId = currentUser?.id;

    const wipe = useCallback(() => {
        setSession(null);
        setMessages([]);
        setPeerTyping(false);
        if (destructTimer.current) { clearTimeout(destructTimer.current); destructTimer.current = null; }
    }, []);

    // Begin the self-destruct animation, then wipe everything from memory.
    const selfDestruct = useCallback((reason) => {
        const s = sessionRef.current;
        if (!s) return;
        setSession({ ...s, status: "destroying", reason });
        if (destructTimer.current) clearTimeout(destructTimer.current);
        destructTimer.current = setTimeout(wipe, DESTRUCT_MS);
    }, [wipe]);

    // ---- actions ----
    const invite = useCallback((toUserId, toName) => {
        if (!toUserId || sessionRef.current) return;
        ephInvite(toUserId);
        setWaiting({ toId: toUserId, toName: toName || null });
    }, [ephInvite]);

    const cancelInvite = useCallback(() => {
        if (waiting?.ephId) ephDecline(waiting.ephId);
        setWaiting(null);
    }, [waiting, ephDecline]);

    const accept = useCallback(() => {
        if (!incomingInvite) return;
        ephAccept(incomingInvite.ephId);
        setIncomingInvite(null);
    }, [incomingInvite, ephAccept]);

    const decline = useCallback(() => {
        if (!incomingInvite) return;
        ephDecline(incomingInvite.ephId);
        setIncomingInvite(null);
    }, [incomingInvite, ephDecline]);

    const send = useCallback((text) => {
        const s = sessionRef.current;
        const body = (text || "").trim();
        if (!s || s.status !== "active" || !body) return;
        const tid = tempId();
        setMessages((prev) => [...prev, { id: tid, text: body, mine: true, ts: Date.now(), status: "sending" }]);
        ephSend(s.ephId, body, tid);
    }, [ephSend]);

    const sendTyping = useCallback((on) => {
        const s = sessionRef.current;
        if (s && s.status === "active") ephTyping(s.ephId, on);
    }, [ephTyping]);

    const leave = useCallback(() => {
        const s = sessionRef.current;
        if (!s) return;
        ephLeave(s.ephId);
        selfDestruct("left");
    }, [ephLeave, selfDestruct]);

    // ---- consume inbound events ----
    useEffect(() => {
        if (!lastEphEvent) return;
        const e = lastEphEvent;
        const s = sessionRef.current;

        switch (e.type) {
            case "eph_invited": {
                // Busy already? politely auto-decline the newcomer.
                if (s || incomingInvite || waiting) {
                    ephDecline(e.eph_id);
                    break;
                }
                setIncomingInvite({
                    ephId: e.eph_id, fromId: e.from_id,
                    fromName: e.from_name, fromAvatar: e.from_avatar,
                });
                break;
            }
            case "eph_invite_sent":
                setWaiting((w) => (w ? { ...w, ephId: e.eph_id } : { ephId: e.eph_id, toId: e.to_id }));
                break;
            case "eph_started": {
                const parts = e.participants || {};
                const peerKey = Object.keys(parts).find((k) => Number(k) !== Number(myId));
                const peer = peerKey
                    ? { id: Number(peerKey), name: parts[peerKey]?.name, avatar: parts[peerKey]?.avatar_url }
                    : { id: null, name: null, avatar: null };
                setWaiting(null);
                setIncomingInvite(null);
                setMessages([]);
                setSession({ ephId: e.eph_id, peer, status: "active" });
                break;
            }
            case "eph_msg": {
                if (s && e.eph_id === s.ephId) {
                    setMessages((prev) => [...prev, {
                        id: e.temp_id || `rx-${e.ts || Date.now()}`,
                        text: e.text, mine: false, ts: Date.now(),
                    }]);
                }
                break;
            }
            case "eph_ack": {
                if (s && e.eph_id === s.ephId && e.temp_id) {
                    setMessages((prev) => prev.map((m) => (m.id === e.temp_id ? { ...m, status: "sent" } : m)));
                }
                break;
            }
            case "eph_typing": {
                if (s && e.eph_id === s.ephId) {
                    setPeerTyping(!!e.on);
                    if (typingTimer.current) clearTimeout(typingTimer.current);
                    if (e.on) typingTimer.current = setTimeout(() => setPeerTyping(false), 4000);
                }
                break;
            }
            case "eph_declined": {
                setWaiting(null);
                setToast({ kind: "declined", text: "Приглашение отклонено" });
                break;
            }
            case "eph_destroyed": {
                if (s && e.eph_id === s.ephId) {
                    selfDestruct(e.reason || "ended");
                } else if (waiting && e.eph_id === waiting.ephId) {
                    setWaiting(null);
                } else if (incomingInvite && e.eph_id === incomingInvite.ephId) {
                    setIncomingInvite(null);
                }
                break;
            }
            default:
                break;
        }
        // consume so the same event doesn't re-fire on re-render
        setLastEphEvent(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastEphEvent]);

    // ---- destroy on leaving the page: close / navigate / minimise / tab-switch ----
    useEffect(() => {
        if (!session || session.status !== "active") return;

        const hardLeave = () => {
            const s = sessionRef.current;
            if (s) ephLeave(s.ephId);
        };
        const onPageHide = () => hardLeave();
        const onBeforeUnload = () => hardLeave();
        const onVisibility = () => {
            if (document.hidden) {
                if (hideTimer.current) clearTimeout(hideTimer.current);
                hideTimer.current = setTimeout(() => {
                    if (document.hidden) leave();
                }, HIDE_GRACE_MS);
            } else if (hideTimer.current) {
                clearTimeout(hideTimer.current);
                hideTimer.current = null;
            }
        };

        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("beforeunload", onBeforeUnload);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("pagehide", onPageHide);
            window.removeEventListener("beforeunload", onBeforeUnload);
            document.removeEventListener("visibilitychange", onVisibility);
            if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        };
    }, [session, ephLeave, leave]);

    // auto-dismiss transient toast
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 2600);
        return () => clearTimeout(t);
    }, [toast]);

    return {
        incomingInvite, waiting, session, messages, peerTyping, toast,
        invite, cancelInvite, accept, decline, send, sendTyping, leave,
        myId,
    };
}
