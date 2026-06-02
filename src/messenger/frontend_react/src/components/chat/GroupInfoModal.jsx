import { useState, useEffect, useMemo } from "react";
import { X, UserPlus, ArrowLeft, Check, Crown } from "lucide-react";
import { Avatar } from "../profile/Avatar";
import { GroupAvatar } from "./GroupAvatar";

// Modal that shows a group's members. Admin sees an "add member" button
// that flips the modal into a picker for non-members (sourced from the
// caller's existing chat partners — same constraint the backend enforces).
export function GroupInfoModal({
  chat,
  members,
  isLoading,
  candidates,
  isAdmin,
  isAdding,
  onCancel,
  onAdd,
}) {
  const [mode, setMode] = useState("members");
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onCancel]);

  // Memberset for fast lookup — picker hides anyone already inside.
  const memberIds = useMemo(
    () => new Set((members || []).map((m) => m.user_id)),
    [members],
  );

  const filteredCandidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (candidates || []).filter((c) => {
      if (memberIds.has(c.id)) return false;
      if (!q) return true;
      const a = (c.display_name || c.name || "").toLowerCase();
      const b = (c.username || "").toLowerCase();
      return a.includes(q) || b.includes(q);
    });
  }, [candidates, filter, memberIds]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    if (selected.size === 0 || isAdding) return;
    onAdd(Array.from(selected));
    setSelected(new Set());
  };

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[85dvh]"
      >
        <header className="flex items-center justify-between p-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-3 min-w-0">
            {mode === "add" && (
              <button
                type="button"
                onClick={() => setMode("members")}
                className="p-1 -ml-1 rounded-md text-zinc-400 hover:text-zinc-100"
                aria-label="Назад"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <GroupAvatar id={chat?.id} name={chat?.name} size={36} className="shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold text-zinc-100 truncate">
                {mode === "add" ? "Добавить участников" : (chat?.name || "Группа")}
              </h2>
              {mode === "members" && (
                <p className="text-xs text-zinc-500">
                  {members ? `${members.length} участников` : "..."}
                </p>
              )}
            </div>
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

        {mode === "members" ? (
          <>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {isLoading ? (
                <div className="text-center py-8 text-sm text-zinc-500">Загрузка...</div>
              ) : (members || []).length === 0 ? (
                <div className="text-center py-8 text-sm text-zinc-500">Нет участников</div>
              ) : (
                (members || []).map((m) => {
                  const displayName = m.display_name || m.username;
                  return (
                    <div
                      key={m.user_id}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-800/40 transition-colors"
                    >
                      <Avatar
                        url={m.avatar}
                        initials={(displayName || "?").slice(0, 1).toUpperCase()}
                        size={36}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-100 truncate">{displayName}</div>
                        {m.username && (
                          <div className="text-xs text-zinc-500 truncate">@{m.username}</div>
                        )}
                      </div>
                      {m.role === "admin" && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-300/90">
                          <Crown size={12} /> админ
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {isAdmin && (
              <footer className="p-4 border-t border-zinc-800/60">
                <button
                  type="button"
                  onClick={() => setMode("add")}
                  className="w-full py-2.5 rounded-xl bg-lime-400 text-zinc-900 font-semibold hover:bg-lime-300 transition-all inline-flex items-center justify-center gap-2"
                >
                  <UserPlus size={18} /> Добавить участника
                </button>
              </footer>
            )}
          </>
        ) : (
          <>
            <div className="p-4 pb-2 space-y-3">
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
              {filteredCandidates.length === 0 ? (
                <div className="text-center py-6 text-sm text-zinc-500">
                  {(candidates || []).length === 0
                    ? "Нет подходящих контактов. Сначала начните личный чат."
                    : "Все ваши контакты уже в группе."}
                </div>
              ) : (
                filteredCandidates.map((c) => {
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
                      {isOn && <Check size={18} className="text-lime-400 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
            <footer className="p-4 border-t border-zinc-800/60 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode("members")}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={selected.size === 0 || isAdding}
                className="flex-1 py-2.5 rounded-xl bg-lime-400 text-zinc-900 font-semibold hover:bg-lime-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isAdding ? "Добавление..." : "Добавить"}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
