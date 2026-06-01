import { AlertCircle, Check, CheckCheck, Clock, Loader2 } from "lucide-react";

/**
 * Render the delivery state of an outgoing message:
 *   pending   → small clock (queued in the WS send)
 *   uploading → spinner with optional % (media uploads only)
 *   sent      → single check ✓ (server has the message, recipient hasn't read yet)
 *   read      → double check ✓✓ (recipient read it — reciprocity-gated upstream)
 *   failed    → red triangle; click handler is wired upstream for retry
 *
 * Incoming messages don't render this component.
 */
export function MessageStatus({ status, readAt, progress, onRetry, isOutMode }) {
  // status="sent" + readAt → render double-check via fallthrough below.
  const tint = isOutMode ? "text-zinc-900/70" : "text-zinc-500";

  if (status === "failed") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center text-red-500 hover:text-red-400 transition-colors"
        title="Не отправлено. Нажмите для повтора."
        aria-label="Повторить отправку"
      >
        <AlertCircle size={12} />
      </button>
    );
  }

  if (status === "uploading") {
    return (
      <span className="inline-flex items-center gap-0.5" title={`Загрузка ${progress ?? 0}%`}>
        <Loader2 size={11} className={`${tint} animate-spin`} />
        {typeof progress === "number" && progress > 0 && progress < 100 && (
          <span className={`text-[9px] leading-none tabular-nums ${tint}`}>
            {progress}%
          </span>
        )}
      </span>
    );
  }

  if (status === "pending") {
    return <Clock size={11} className={tint} aria-label="Ожидание отправки" />;
  }

  // sent (default for server-assigned messages without read_at)
  if (!readAt) {
    return <Check size={12} className={tint} aria-label="Доставлено" />;
  }

  // read receipt
  return (
    <CheckCheck
      size={12}
      className={isOutMode ? "text-zinc-900" : "text-lime-400"}
      aria-label="Прочитано"
    />
  );
}
