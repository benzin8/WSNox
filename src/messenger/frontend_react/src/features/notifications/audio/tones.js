import { TONES } from "../constants.js";

let sharedCtx = null;

function getCtx() {
  if (sharedCtx) return sharedCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx = new Ctor();
  return sharedCtx;
}

/**
 * Играет короткий тон (sine с envelope).
 * Молча игнорирует, если AudioContext suspended или API не поддерживается.
 * @param {string} sample — ключ из TONES (ding/chime/bell)
 */
export function playTone(sample) {
  const config = TONES[sample] || TONES.ding;
  const ctx = getCtx();
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const duration = config.durationMs / 1000;

    config.freqs.forEach((freq, idx) => {
      const start = now + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    });
  } catch {
    // молча
  }
}
