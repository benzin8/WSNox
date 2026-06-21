# Chat media gallery + in-chat search

Tap a chat's name → a **ChatInfoModal** that surfaces, for every chat type
(private / group / channel):

- a **media gallery** (all photos/videos in that chat), and
- **search** within that chat — by words and by date.

Channels render this as a wide "magazine" feed; private/group render a compact
grid. Search is always scoped to the **open chat** (never global).

## Constraint that shaped the design

Message bodies are encrypted at rest (AES-GCM, `core/crypto.py`). Postgres
full-text search over ciphertext is impossible, so word search uses
**approach A (approved): decrypt-and-filter on the fly, per chat** — the server
pulls the chat's messages, decrypts in-process, filters by the query, returns a
page. No plaintext is persisted (privacy unchanged). Cost on very long channels
is bounded with `limit` + cursor pagination and search-on-submit (not
per-keystroke). Media and date never need decryption.

## Backend

- `GET /chats/{chat_id}/media?before_id=&limit=` → media messages
  (`msg_type in (image, video)`) newest-first, with resolved thumb/full URLs +
  `created_at`. Membership-gated (reuses `cached_is_chat_member`). Cursor =
  `before_id`.
- `GET /chats/{chat_id}/search?q=&from=&to=&before_id=&limit=` → text matches.
  Date-only (no `q`) filters on the indexed `created_at` purely in SQL. With
  `q`, the server decrypts each candidate (already date/`before_id`-narrowed)
  and keeps case-insensitive substring matches. Returns the same message shape
  the chat uses (so the client can render/scroll-to bubbles), plus a snippet.
  Membership-gated. Channels included (members react/read; search is read-only).

Both reuse `MessageCRUD` + the existing attachment-URL resolver; no schema
change, no migration.

## Frontend

- `ChatInfoModal` (new) opens on header-name tap for all chat types. Sections:
  identity row (+ link to existing ProfileModal/GroupInfoModal so that stays
  reachable), a search bar (text input + date pickers), and the media grid.
- Media grid: square thumbnails, tap → existing `MediaLightbox`; infinite scroll
  via `before_id`.
- Search results: list of matching messages with snippet + date; tap → close
  modal and `scrollToMessage` in the open chat (the bubble flash already exists).
- Channel = "magazine": one wide column, larger media tiles, date dividers;
  private/group = compact multi-column grid.

## Slices (ship + verify each)

1. Media gallery: `/media` endpoint + `ChatInfoModal` shell + grid + lightbox;
   wire header tap; keep profile/members reachable.
2. Search: `/search` (words on-the-fly + date) + search UI + scroll-to-result.
3. Channel "magazine" styling of the gallery/feed.

## Out of scope (for now)

Global cross-chat search; files/links tabs; a persisted search index (would be
approach B). Revisit a real index only if on-the-fly search gets too slow on
large channels.
