import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Trash2, Send } from "lucide-react";

const MAX_MS = 5 * 60 * 1000; // matches backend MAX_DURATION_MS

// Pick the best container the browser's MediaRecorder supports. Chrome/FF →
// webm/opus, Safari/iOS → mp4. All are in the backend ALLOWED_AUDIO_MIME.
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
}

function fmt(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Tap-to-record voice recorder. Tap the mic to start, then either send (✓) or
 * discard (🗑). Records via MediaRecorder, measures duration locally and hands
 * the finished blob (as a File) + `{duration_ms}` meta to `onRecorded`.
 *
 * Hidden entirely if the browser has no MediaRecorder (older Safari).
 */
export function VoiceRecorder({ onRecorded, disabled }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startRef = useRef(0);
  const tickRef = useRef(null);
  const cancelRef = useRef(false);
  const supported = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const cleanup = useCallback(() => {
    clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsed(0);
  }, []);

  useEffect(() => () => {
    // On unmount: stop any in-flight recording without emitting.
    cancelRef.current = true;
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const stopAndSend = useCallback(() => {
    cancelRef.current = false;
    try { recorderRef.current?.stop(); } catch { cleanup(); }
  }, [cleanup]);

  const discard = useCallback(() => {
    cancelRef.current = true;
    try { recorderRef.current?.stop(); } catch { cleanup(); }
  }, [cleanup]);

  const start = useCallback(async () => {
    if (disabled || recording) return;
    const mime = pickMime();
    if (mime === null) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("Нет доступа к микрофону");
      return;
    }
    cancelRef.current = false;
    streamRef.current = stream;
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const durationMs = Math.min(MAX_MS, Date.now() - startRef.current);
      const stream2 = streamRef.current;
      const wasCancelled = cancelRef.current;
      const type = rec.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      cleanup();
      stream2?.getTracks().forEach((t) => t.stop());
      if (wasCancelled || blob.size === 0 || durationMs < 500) return;
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `voice.${ext}`, { type });
      onRecorded(file, { duration_ms: durationMs });
    };
    startRef.current = Date.now();
    rec.start();
    setRecording(true);
    setElapsed(0);
    tickRef.current = setInterval(() => {
      const e = Date.now() - startRef.current;
      setElapsed(e);
      if (e >= MAX_MS) stopAndSend();
    }, 200);
  }, [disabled, recording, onRecorded, cleanup, stopAndSend]);

  if (!supported) return null;

  if (recording) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={discard}
          aria-label="Отменить запись"
          className="shrink-0 p-2 rounded-xl text-zinc-400 hover:text-red-400 transition-colors"
        >
          <Trash2 size={18} />
        </button>
        <span className="flex items-center gap-1.5 text-xs text-red-400 tabular-nums">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {fmt(elapsed)}
        </span>
        <button
          type="button"
          onClick={stopAndSend}
          aria-label="Отправить голосовое"
          className="p-3 rounded-xl bg-lime-400 text-zinc-900 hover:bg-lime-300 transition-all active:scale-[0.97]"
        >
          <Send size={18} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      aria-label="Записать голосовое сообщение"
      title="Записать голосовое сообщение"
      className="shrink-0 p-3 rounded-xl text-zinc-400 hover:text-lime-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-40"
    >
      <Mic size={20} />
    </button>
  );
}
