import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, Mic } from "lucide-react";

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Fallback bars for voice notes with no server-computed waveform (older
// messages, or when ffmpeg decoding failed). Real notes carry a `waveform`
// array of amplitude peaks (0..100) in attachment_meta.
const BARS = [6, 10, 14, 9, 16, 11, 7, 13, 18, 10, 6, 12, 15, 8, 11, 14, 9, 7, 12, 16, 10, 6];

/**
 * Voice-note player rendered inside a chat bubble.
 *
 * Plays the (presigned or local blob) audio URL via a hidden <audio>. Shows a
 * play/pause toggle, a faux-waveform progress bar (click to seek) and the
 * elapsed/total time. `durationMs` (from client meta) seeds the total before
 * the audio element reports its own duration.
 */
export function VoiceMessage({ url, durationMs, isUploading, isOut, waveform }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(durationMs ? durationMs / 1000 : 0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return undefined;
    const onTime = () => setCur(a.currentTime);
    const onLoaded = () => { if (isFinite(a.duration) && a.duration > 0) setDur(a.duration); };
    const onEnd = () => { setPlaying(false); setCur(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("ended", onEnd);
    };
  }, [url]);

  const toggle = (e) => {
    // Stop the tap from bubbling to the message bubble, which would otherwise
    // open the copy/reply action menu.
    e?.stopPropagation();
    const a = audioRef.current;
    if (!a || isUploading) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };

  const seek = (e) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setCur(a.currentTime);
  };

  const progress = dur ? Math.min(1, cur / dur) : 0;
  const accent = isOut ? "#18181b" : "var(--color-lime-400)";
  // Real amplitude peaks (0..100) computed on the server when available; else
  // the static placeholder. The just-sent (optimistic) note has no waveform yet
  // — it appears for everyone once the server-processed message is fetched.
  const hasWave = Array.isArray(waveform) && waveform.length > 0;
  const bars = hasWave ? waveform : BARS;

  return (
    <div className="flex items-center gap-3 py-1" style={{ width: "min(240px, 62vw)" }}>
      {/* preload="auto" fetches the audio ahead of the first tap. With
          "metadata" the first play could start before any samples were
          buffered, producing a silent first play that only worked on the
          second tap (once the data was cached). */}
      <audio ref={audioRef} src={url} preload="auto" />
      <button
        type="button"
        onClick={toggle}
        disabled={isUploading}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
        className="shrink-0 w-9 h-9 rounded-full grid place-items-center"
        style={{ background: isOut ? "rgba(0,0,0,0.18)" : "rgba(var(--accent-rgb),0.2)", color: accent }}
      >
        {isUploading ? <Loader2 size={16} className="animate-spin" />
          : playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          onClick={seek}
          className="relative flex items-center gap-[2px] h-6 cursor-pointer"
          role="slider"
          aria-label="Перемотка"
          aria-valuenow={Math.round(progress * 100)}
        >
          {bars.map((v, i) => {
            const filled = (i + 1) / bars.length <= progress;
            // Real waveform values are 0..100 → scale to 3..20px; the static
            // placeholder values are already pixel heights. Unfilled bars use a
            // translucent tint of the accent (not a flat white/black track) so
            // the waveform stays visible on both light and dark bubbles.
            const h = hasWave ? 3 + (v / 100) * 17 : v;
            return (
              <span
                key={i}
                className="flex-1 rounded-full"
                style={{ height: h, background: accent, opacity: filled ? 1 : 0.32 }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Mic size={11} style={{ color: accent, opacity: 0.7 }} />
          <span className="text-[10px] tabular-nums" style={{ color: accent, opacity: 0.8 }}>
            {fmt(playing || cur ? cur : dur)}
          </span>
        </div>
      </div>
    </div>
  );
}
