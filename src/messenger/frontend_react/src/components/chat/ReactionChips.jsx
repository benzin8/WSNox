import { useState } from "react";
import { Zap } from "lucide-react";
import { Avatar } from "../profile/Avatar";

// Below this many reactors we show their faces (Telegram-style); at/above it we
// collapse to a plain count. Mirrors the backend AVATAR_THRESHOLD.
const FACE_THRESHOLD = 3;

// Up-to-2 overlapping reactor faces, shown instead of a count for low reactions.
function ReactorFaces({ reactors, ringClass }) {
  return (
    <span className="flex items-center -space-x-1.5">
      {reactors.map((r, i) => (
        <Avatar
          key={i}
          url={r?.url}
          initials={(r?.name || "?").slice(0, 1).toUpperCase()}
          size={18}
          className={ringClass}
        />
      ))}
    </span>
  );
}

/**
 * Reaction chips under a message bubble: emoji counts + the aura (⚡) tally.
 * Tapping a chip toggles that reaction for the current user. The aura GLOW
 * itself lives on the bubble (MessageBubble) — this is just the counters.
 *
 * `onReact(type, emoji?)` — type "emoji" | "aura".
 */
export function ReactionChips({ reactions, isOut, onReact }) {
  // Key of the chip currently playing its tap "pop" ("aura" or the emoji).
  const [popKey, setPopKey] = useState(null);
  if (!reactions) return null;
  const emojiEntries = Object.entries(reactions.emoji || {}).filter(([, c]) => c > 0);
  const aura = reactions.aura || 0;
  if (emojiEntries.length === 0 && aura === 0) return null;

  const popClass = (key) => (popKey === key ? " animate-reaction-pop" : "");
  const clearPop = (key) => setPopKey((k) => (k === key ? null : k));

  const base =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full leading-none cursor-pointer transition-colors select-none";
  // On the lime outgoing bubble a translucent chip melted into the bubble, so
  // use solid dark chips there; incoming (dark) bubbles keep the lighter chip.
  const chip = (active) =>
    isOut
      ? `${base} ${
          active
            ? "bg-zinc-900 text-lime-300 ring-1 ring-lime-300/50"
            : "bg-zinc-900/60 text-zinc-100 hover:bg-zinc-900/80"
        }`
      : `${base} ${
          active
            ? "bg-lime-400/25 text-lime-300 ring-1 ring-lime-400/50"
            : "bg-zinc-700/60 text-zinc-200 hover:bg-zinc-700"
        }`;

  // Ring around faces so overlapping circles read as separate cut-outs against
  // the chip background.
  const ringClass = isOut ? "ring-2 ring-zinc-900" : "ring-2 ring-zinc-700";

  // Faces for <3 reactors, otherwise the count.
  const tail = (count, reactors) =>
    count < FACE_THRESHOLD && reactors && reactors.length > 0 ? (
      <ReactorFaces reactors={reactors} ringClass={ringClass} />
    ) : (
      <span className="text-[13px] tabular-nums">{count}</span>
    );

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
      {emojiEntries.map(([emoji, count]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => { setPopKey(emoji); onReact?.("emoji", emoji); }}
          onAnimationEnd={() => clearPop(emoji)}
          className={chip(reactions.my_emoji === emoji) + popClass(emoji)}
        >
          <span className="text-[17px] leading-none">{emoji}</span>
          {tail(count, reactions.emoji_reactors?.[emoji])}
        </button>
      ))}
      {aura > 0 && (
        <button
          type="button"
          onClick={() => { setPopKey("aura"); onReact?.("aura"); }}
          onAnimationEnd={() => clearPop("aura")}
          title="Усиление ауры"
          className={chip(reactions.my_aura) + popClass("aura")}
        >
          <Zap
            size={16}
            className={reactions.my_aura ? "text-lime-300" : "text-lime-400"}
            fill={reactions.my_aura ? "currentColor" : "none"}
          />
          {tail(aura, reactions.aura_reactors)}
        </button>
      )}
    </div>
  );
}
