import { useState } from "react";

// Confirms a ban / unban. Requires typing the target's email (anti-fat-finger,
// mirrors the role-change flow) and an optional reason. The parent keys this by
// target id so it mounts fresh per target (no reset effect needed).
export default function BanConfirmModal({ open, target, onClose, onConfirm }) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  if (!open || !target) return null;
  const banning = !target.is_banned;
  const ok = email.trim().toLowerCase() === (target.email || "").toLowerCase();

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      await onConfirm(target.id, banning, email.trim(), reason.trim());
      onClose();
    } catch (e) {
      setErr(e.message || "Ошибка");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 rounded-2xl shadow-2xl p-5"
      >
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">
          {banning ? "Забанить" : "Разбанить"} {target.name}
        </h2>
        <p className="text-sm text-zinc-500 mb-4 leading-relaxed">
          {banning
            ? "Юзер не сможет войти, пользоваться API и открыть сокет (активный — выкинет)."
            : "Юзеру вернётся доступ."}{" "}
          Для подтверждения введи его email: <span className="text-zinc-300">{target.email}</span>
        </p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email юзера"
          className="w-full bg-zinc-800/40 border border-zinc-700/60 rounded-lg py-2 px-3 text-sm text-zinc-100 placeholder-zinc-500 mb-3 focus:outline-none focus:border-lime-400/50"
        />
        {banning && (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина (необязательно)"
            maxLength={300}
            className="w-full bg-zinc-800/40 border border-zinc-700/60 rounded-lg py-2 px-3 text-sm text-zinc-100 placeholder-zinc-500 mb-3 focus:outline-none focus:border-lime-400/50"
          />
        )}
        {err && <p className="text-sm text-red-400 mb-3">{err}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!ok || busy}
            className={`flex-1 py-2.5 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
              banning ? "bg-red-500 text-white hover:bg-red-400" : "bg-lime-400 text-zinc-900 hover:bg-lime-300"
            }`}
          >
            {busy ? "..." : banning ? "Забанить" : "Разбанить"}
          </button>
        </div>
      </div>
    </div>
  );
}
