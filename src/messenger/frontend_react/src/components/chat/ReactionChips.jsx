import { useState } from "react";
import { Zap } from "lucide-react";

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

  const chip = (active) =>
    `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs leading-none cursor-pointer transition-colors select-none ${
      active
        ? "bg-lime-400/25 text-lime-300 ring-1 ring-lime-400/50"
        : isOut
        ? "bg-black/15 text-zinc-800 hover:bg-black/25"
        : "bg-zinc-700/60 text-zinc-200 hover:bg-zinc-700"
    }`;

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
          <span>{emoji}</span>
          <span className="tabular-nums">{count}</span>
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
            size={12}
            className={reactions.my_aura ? "text-lime-300" : "text-lime-400"}
            fill={reactions.my_aura ? "currentColor" : "none"}
          />
          <span className="tabular-nums">{aura}</span>
        </button>
      )}
    </div>
  );
}
