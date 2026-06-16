import { useState, useEffect, useCallback, useMemo } from "react";
import { ThemeContext } from "./ThemeContext.js";
import { ACCENT_SHADES, DEFAULT_ACCENT, getAccent } from "./accents.js";

const STORAGE_KEY = "wsnox_theme_preference";
const ACCENT_KEY = "wsnox_accent";

const THEME_META_COLORS = {
  dark: "#09090b",
  light: "#f5f3ef",
};

function getSystemTheme() {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function loadPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable (private mode / disabled) — fall through to default
  }
  return "dark";
}

function loadAccent() {
  try {
    const stored = localStorage.getItem(ACCENT_KEY);
    if (stored && getAccent(stored).id === stored) return stored;
  } catch {
    // localStorage unavailable — fall through to default
  }
  return DEFAULT_ACCENT;
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);

  // Update PWA theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_META_COLORS[theme] || THEME_META_COLORS.dark);
  }
}

// Repaint the accent by overriding the lime-* CSS variables every `lime-*`
// utility resolves to. Theme-aware: dark uses the bright ramp, light the
// darker one. Inline style on <html> wins over the [data-theme] rules in CSS.
function applyAccent(accentId, theme) {
  const accent = getAccent(accentId);
  const ramp = accent[theme === "light" ? "light" : "dark"];
  const root = document.documentElement;
  for (const shade of ACCENT_SHADES) {
    root.style.setProperty(`--color-lime-${shade}`, ramp[shade]);
  }
  // Vivid sRGB triplet for `rgba(var(--accent-rgb), A)` glows/shadows.
  root.style.setProperty("--accent-rgb", accent.rgb);
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(loadPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [accent, setAccentState] = useState(loadAccent);

  const theme = preference === "system" ? systemTheme : preference;

  // Apply theme to DOM
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Apply accent whenever the accent OR the resolved theme changes.
  useEffect(() => {
    applyAccent(accent, theme);
  }, [accent, theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemTheme(e.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const setPreference = useCallback((pref) => {
    setPreferenceState(pref);
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // localStorage write rejected (private mode / quota) — preference still lives in state
    }
  }, []);

  const setAccent = useCallback((id) => {
    const valid = getAccent(id).id;
    setAccentState(valid);
    try {
      localStorage.setItem(ACCENT_KEY, valid);
    } catch {
      // localStorage write rejected — accent still lives in state
    }
  }, []);

  const value = useMemo(
    () => ({ theme, preference, setPreference, accent, setAccent }),
    [theme, preference, setPreference, accent, setAccent],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
