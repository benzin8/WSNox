import { createContext, useState, useEffect, useCallback, useMemo } from "react";
import { STORAGE_KEY, DEFAULT_SETTINGS } from "../constants.js";
import { requestDesktopPermission } from "../utils/permissions.js";

export const NotificationSettingsContext = createContext(null);

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      sound:      { ...DEFAULT_SETTINGS.sound,      ...(parsed.sound || {}) },
      desktop:    { ...DEFAULT_SETTINGS.desktop,    ...(parsed.desktop || {}) },
      titleBadge: { ...DEFAULT_SETTINGS.titleBadge, ...(parsed.titleBadge || {}) },
      mutedChats: Array.isArray(parsed.mutedChats) ? parsed.mutedChats : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persist(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // private mode — игнорируем, работаем in-memory
  }
}

export function NotificationSettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadInitial);

  useEffect(() => {
    persist(settings);
  }, [settings]);

  const setSoundEnabled = useCallback((enabled) => {
    setSettings((s) => ({ ...s, sound: { ...s.sound, enabled } }));
  }, []);

  const setSoundSample = useCallback((sample) => {
    setSettings((s) => ({ ...s, sound: { ...s.sound, sample } }));
  }, []);

  const setDesktopEnabled = useCallback(async (enabled) => {
    if (!enabled) {
      setSettings((s) => ({ ...s, desktop: { enabled: false } }));
      return "ok";
    }
    const result = await requestDesktopPermission();
    if (result === "granted") {
      setSettings((s) => ({ ...s, desktop: { enabled: true } }));
      return "granted";
    }
    setSettings((s) => ({ ...s, desktop: { enabled: false } }));
    return result;
  }, []);

  const setTitleBadgeEnabled = useCallback((enabled) => {
    setSettings((s) => ({ ...s, titleBadge: { enabled } }));
  }, []);

  const toggleMute = useCallback((chatId) => {
    setSettings((s) => {
      const id = Number(chatId);
      const has = s.mutedChats.includes(id);
      return {
        ...s,
        mutedChats: has ? s.mutedChats.filter((x) => x !== id) : [...s.mutedChats, id],
      };
    });
  }, []);

  const isMuted = useCallback(
    (chatId) => settings.mutedChats.includes(Number(chatId)),
    [settings.mutedChats]
  );

  const value = useMemo(
    () => ({
      settings,
      setSoundEnabled,
      setSoundSample,
      setDesktopEnabled,
      setTitleBadgeEnabled,
      toggleMute,
      isMuted,
    }),
    [settings, setSoundEnabled, setSoundSample, setDesktopEnabled, setTitleBadgeEnabled, toggleMute, isMuted]
  );

  return (
    <NotificationSettingsContext.Provider value={value}>
      {children}
    </NotificationSettingsContext.Provider>
  );
}
