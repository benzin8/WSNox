/**
 * Accent presets.
 *
 * The whole UI is painted with Tailwind `lime-*` utilities, which resolve to
 * the CSS variables `--color-lime-300/400/500/600`. Selecting an accent simply
 * rewrites those four variables on <html>, so every `lime-*` class follows the
 * choice with zero component changes.
 *
 * Each accent carries a `dark` and `light` ramp because the same hue needs a
 * brighter tone on the dark background and a darker, less saturated tone to
 * stay legible on the near‑white light background.
 */

// oklch [lightness, chroma] per shade. Browsers gamut‑map out‑of‑sRGB chroma,
// so blues/violets clamp gracefully instead of looking neon.
const DARK = {
  300: [0.885, 0.16],
  400: [0.83, 0.205],
  500: [0.74, 0.205],
  600: [0.64, 0.18],
};
const LIGHT = {
  300: [0.8, 0.155],
  400: [0.65, 0.2],
  500: [0.56, 0.185],
  600: [0.47, 0.16],
};

const SHADES = [300, 400, 500, 600];

function ramp(hue, table) {
  const out = {};
  for (const shade of SHADES) {
    const [l, c] = table[shade];
    out[shade] = `oklch(${l} ${c} ${hue})`;
  }
  return out;
}

const DEFS = [
  { id: "lime", label: "Лайм", hue: 130 },
  { id: "emerald", label: "Изумруд", hue: 162 },
  { id: "sky", label: "Небо", hue: 245 },
  { id: "violet", label: "Фиалка", hue: 292 },
  { id: "rose", label: "Роза", hue: 14 },
  { id: "amber", label: "Янтарь", hue: 72 },
];

export const ACCENTS = DEFS.map((a) => ({
  ...a,
  // Bright dot for the picker swatch — recognizable regardless of theme.
  swatch: `oklch(0.82 0.2 ${a.hue})`,
  dark: ramp(a.hue, DARK),
  light: ramp(a.hue, LIGHT),
}));

export const ACCENT_SHADES = SHADES;
export const DEFAULT_ACCENT = "lime";

const BY_ID = Object.fromEntries(ACCENTS.map((a) => [a.id, a]));

export function getAccent(id) {
  return BY_ID[id] || BY_ID[DEFAULT_ACCENT];
}
