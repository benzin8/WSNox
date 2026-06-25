# One-time (ephemeral) chats

A one-time chat lives **only in transit**. Messages are relayed over the existing
chat WebSocket and held **only in the two clients' RAM** — nothing is ever
written to the database. The chat **self-destructs for both participants** the
moment either one leaves, closes, navigates away, **minimises or switches tab**,
or loses connection.

## Flow

1. In a private (1:1) chat, either user clicks the **🔥 Flame** button in the
   chat header → an invite is sent to the other user.
2. The other user sees an **invite prompt** (Принять / Отклонить).
3. On accept, a dedicated **one-time chat window** opens for both, with a clear
   "messages are not saved" banner.
4. Messages are exchanged in real time and kept only in component state.
5. The chat **burns up** (animated self-destruct) and is wiped from both clients
   the instant either participant leaves.

## Backend

`src/messenger/backend/app/ws/ephemeral.py`

- Pure relay + tiny routing metadata. The only thing stored in Redis is the
  session's participant ids + status (`eph:sess:{id}`) and a per-user reverse
  index (`eph:user:{uid}`), both with a short TTL. **Message content is published
  to a pub/sub channel and forgotten** — never persisted.
- Works across multiple uvicorn workers (prod runs 2): every server→client event
  is fanned out over the `ephemeral_events` pub/sub channel, and each worker's
  `ephemeral_listener` delivers it to whatever sockets the target users hold on
  that worker.
- WS events handled in `ws/router.py`: `eph_invite`, `eph_accept`,
  `eph_decline`, `eph_msg`, `eph_typing`, `eph_leave`.
- **Destroy triggers:** the client sends `eph_leave` on visibility/unload; the
  server also nukes the session on the user's last-socket disconnect
  (`on_user_gone`) as a crash/network-loss backstop.
- Rate limits for `eph_msg` / `eph_invite` / `eph_typing` in `core/rate_limit.py`.

Tests: `tests/test_ephemeral.py` (7 tests) exercise the full
publish → listener → delivery path + cleanup with fakeredis and a fake manager.

## Frontend

- `src/hooks/useChatSocket.js` — surfaces `eph_*` events via a registered handler
  (not a single state value, so a burst of messages can't be coalesced/lost) and
  exposes invite/accept/decline/send/typing/leave senders.
- `src/hooks/useEphemeral.js` — client state machine
  (invite → waiting → active → destroyed); messages live only here; destroy on
  `visibilitychange` + `beforeunload` + `pagehide`; self-destruct timing.
- `src/components/chat/EphemeralLayer.jsx` — invite prompt, waiting card, live
  window (typing indicator, burn/dissolve self-destruct overlay).
- `src/components/chat/ChatWindow.jsx` — the 🔥 button (private chats only).
- `src/index.css` — `ephOverlayIn` / `ephMsgIn` / `ephDestruct` / `emberPulse`
  keyframes (+ `prefers-reduced-motion` fallbacks).

## Tunables

- `HIDE_GRACE_MS` in `useEphemeral.js` — delay before a hidden tab self-destructs
  the chat. Default `0` (immediate). Raise (e.g. `3000`) for a softer grace.
- `DESTRUCT_MS` — self-destruct animation length (keep in sync with
  `.animate-ephDestruct`).

## How to test locally

```bash
# from repo root, with Docker available:
docker-compose up --build           # db + redis + backend + nginx
cd src/messenger/frontend_react && npm run dev   # or rely on the built dist
```

Register/log in two accounts (two browsers or a normal + private window), open a
1:1 chat, click 🔥, accept on the other side, exchange messages, then minimise /
close one tab and watch the chat burn up on both.

Backend logic is covered without a full stack by `pytest tests/test_ephemeral.py`.
