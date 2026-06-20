import { useEffect, useState } from "react";
import { X, Megaphone } from "lucide-react";

// Modal for creating a public channel. Channels broadcast: the creator (owner)
// posts, everyone else subscribes (via search or invite link) and reacts.
export function CreateChannelModal({ onCancel, onCreate, isSubmitting }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onCancel]);

  const canSubmit = name.trim().length > 0 && !isSubmitting;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onCreate(name.trim(), description.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between p-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-2 text-zinc-100">
            <Megaphone size={20} className="text-lime-400" />
            <h2 className="font-semibold">Новый канал</h2>
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
            placeholder="Название канала"
            maxLength={100}
            autoFocus
            className="w-full bg-zinc-800/40 border border-zinc-700/60 rounded-xl py-2.5 px-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-lime-400/50 focus:ring-2 focus:ring-lime-400/40"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание (необязательно)"
            maxLength={300}
            rows={3}
            className="w-full bg-zinc-800/30 border border-zinc-700/60 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-lime-400/50 resize-y"
          />
          <p className="text-xs text-zinc-500">
            Публичный канал: постишь только ты, остальные подписываются (поиском или по ссылке) и ставят реакции.
          </p>
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
