import { useState, useEffect, useMemo } from "react";
import { X, Check, Users } from "lucide-react";
import { Avatar } from "../profile/Avatar";

// Modal for creating a new group chat. Members are picked from the user's
// existing chat partners (= people they already share a private chat with).
// This matches the backend's guard in POST /chats/group, so the UI never
// offers a selection the API would reject.
export function CreateGroupModal({ candidates, onCancel, onCreate, isSubmitting }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onCancel]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const a = (c.display_name || c.name || "").toLowerCase();
      const b = (c.username || "").toLowerCase();
      return a.includes(q) || b.includes(q);
    });
  }, [candidates, filter]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const canSubmit = name.trim().length > 0 && selected.size >= 1 && !isSubmitting;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onCreate(name.trim(), Array.from(selected));
  };

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[85dvh]"
      >
        <header className="flex items-center justify-between p-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-2 text-zinc-100">
            <Users size={20} className="text-lime-400" />
            <h2 className="font-semibold">Новая группа</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название группы"
            maxLength={100}
            autoFocus
            className="w-full bg-zinc-800/40 border border-zinc-700/60 rounded-xl py-2.5 px-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-lime-400/50 focus:ring-2 focus:ring-lime-400/40"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск контакта..."
            className="w-full bg-zinc-800/30 border border-zinc-700/60 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-lime-400/50"
          />
          <div className="text-xs text-zinc-500">
            Выбрано: {selected.size}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 ? (
            <div className="text-center py-6 text-sm text-zinc-500">
              {candidates.length === 0
                ? "Нет контактов. Сначала начните личный чат."
                : "Ничего не найдено."}
            </div>
          ) : (
            filtered.map((c) => {
              const isOn = selected.has(c.id);
              const displayName = c.display_name || c.name || c.username;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                    isOn ? "bg-lime-400/10 border border-lime-400/40" : "hover:bg-zinc-800/50 border border-transparent"
                  }`}
                >
                  <Avatar
                    url={c.avatar_thumb_url}
                    initials={(displayName || "?").slice(0, 1).toUpperCase()}
                    size={36}
                  />
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium text-zinc-100 truncate">{displayName}</div>
                    {c.username && (
                      <div className="text-xs text-zinc-500 truncate">@{c.username}</div>
                    )}
                  </div>
                  {isOn && (
                    <Check size={18} className="text-lime-400 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <footer className="p-4 border-t border-zinc-800/60 flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-xl bg-lime-400 text-zinc-900 font-semibold hover:bg-lime-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? "Создание..." : "Создать"}
          </button>
        </footer>
      </form>
    </div>
  );
}
