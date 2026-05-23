/**
 * Safari/Chrome требуют user gesture перед тем как AudioContext может играть.
 * Этот модуль один раз на первое нажатие/тач/клик «разогревает» контекст и
 * снимает себя с прослушки.
 */
let unlocked = false;

export function installAudioUnlock(getCtx) {
  if (unlocked) return;
  if (typeof window === "undefined") return;

  const events = ["pointerdown", "keydown", "touchstart"];

  function unlock() {
    if (unlocked) return;
    const ctx = getCtx();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    // Молчаливо проигрываем «нулевой» буфер — это помогает Safari/iOS
    try {
      if (ctx) {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch {
      // ignore
    }
    unlocked = true;
    events.forEach((e) => window.removeEventListener(e, unlock, true));
  }

  events.forEach((e) => window.addEventListener(e, unlock, { capture: true, once: false }));
}
