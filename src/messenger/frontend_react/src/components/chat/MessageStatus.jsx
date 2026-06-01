import { AlertCircle, Loader2 } from "lucide-react";

/**
 * Compact delivery indicator on outgoing messages.
 *
 *   uploading → small spinner + % (for media uploads)
 *   failed    → red triangle (click → retry handled upstream)
 *   anything else → tiny dot, dim if not yet read, dark when read_at lands
 */
export function MessageStatus({ status, readAt, progress, onRetry, isOutMode }) {
  if (status === "failed") {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRetry?.(); }}
        title="Не отправлено. Нажмите для повтора."
        aria-label="Повторить отправку"
        className="inline-flex items-center text-red-500 hover:text-red-400 transition-colors"
      >
        <AlertCircle size={12} />
      </button>
    );
  }

  if (status === "uploading") {
    return (
      <span className="inline-flex items-center gap-0.5" title={`Загрузка ${progress ?? 0}%`}>
        <Loader2
          size={10}
          className={`animate-spin ${isOutMode ? "text-zinc-900/70" : "text-zinc-500"}`}
        />
        {typeof progress === "number" && progress > 0 && progress < 100 && (
          <span className={`text-[9px] leading-none tabular-nums ${isOutMode ? "text-zinc-900/70" : "text-zinc-500"}`}>
            {progress}%
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${
        readAt
          ? (isOutMode ? "bg-zinc-900" : "bg-lime-400")
          : (isOutMode ? "bg-zinc-900/40" : "bg-zinc-500/50")
      }`}
      title={readAt ? "Прочитано" : "Доставлено"}
    />
  );
}
