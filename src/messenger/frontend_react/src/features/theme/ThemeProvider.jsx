import { useState, useEffect, useCallback, useMemo } from "react";
import { ThemeContext } from "./ThemeContext.js";

const STORAGE_KEY = "wsnox_theme_preference";

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

function resolveTheme(preference) {
  if (preference === "system") return getSystemTheme();
  return preference;
}

function loadPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {}
  return "dark";
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

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(loadPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  const theme = preference === "system" ? systemTheme : preference;

  // Apply theme to DOM
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ theme, preference, setPreference }),
    [theme, preference, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
