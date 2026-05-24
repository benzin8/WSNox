import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { STORAGE_KEY, DEFAULT_SETTINGS, MIGRATION_FLAG_KEY } from "../constants.js";
import { requestDesktopPermission } from "../utils/permissions.js";
import { NotificationSettingsContext } from "./NotificationSettingsContext.js";
import {
  fetchNotificationPreferences,
  setDndOnServer,
  setChatMuteOnServer,
  setReadReceiptsOnServer,
} from "../api.js";

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
      dnd:        typeof parsed.dnd === "boolean" ? parsed.dnd : false,
      readReceipts: typeof parsed.readReceipts === "boolean" ? parsed.readReceipts : true,
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
  const syncedRef = useRef(false);

  useEffect(() => {
    persist(settings);
  }, [settings]);

  // On mount: fetch server-side prefs, merge & one-time migrate cached mutes.
  useEffect(() => {
    if (syncedRef.current) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    syncedRef.current = true;

    (async () => {
      try {
        const prefs = await fetchNotificationPreferences();
        const serverMuted = Array.isArray(prefs.muted_chats) ? prefs.muted_chats : [];
        const serverDnd = !!prefs.dnd;

        const alreadyMigrated = localStorage.getItem(MIGRATION_FLAG_KEY) === "1";
        const cachedMuted = settings.mutedChats || [];
        const toMigrate = alreadyMigrated
          ? []
          : cachedMuted.filter((id) => !serverMuted.includes(id));

        if (toMigrate.length > 0) {
          await Promise.all(
            toMigrate.map((id) =>
              setChatMuteOnServer(id, true).catch(() => null)
            )
          );
        }
        localStorage.setItem(MIGRATION_FLAG_KEY, "1");

        const mergedMuted = Array.from(new Set([...serverMuted, ...toMigrate]));
        const serverReadReceipts = prefs.read_receipts_enabled !== false;
        setSettings((s) => ({
          ...s,
          mutedChats: mergedMuted,
          dnd: serverDnd,
          readReceipts: serverReadReceipts,
        }));
      } catch (err) {
        console.warn("[notifications] failed to sync preferences:", err);
      }
    })();
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const id = Number(chatId);
    let nextMuted;
    setSettings((s) => {
      const has = s.mutedChats.includes(id);
      nextMuted = !has;
      return {
        ...s,
        mutedChats: has ? s.mutedChats.filter((x) => x !== id) : [...s.mutedChats, id],
      };
    });
    setChatMuteOnServer(id, nextMuted).catch((err) => {
      console.warn("[notifications] mute sync failed, rolling back:", err);
      setSettings((s) => ({
        ...s,
        mutedChats: nextMuted
          ? s.mutedChats.filter((x) => x !== id)
          : [...s.mutedChats, id],
      }));
    });
  }, []);

  const setDnd = useCallback((enabled) => {
    const next = !!enabled;
    setSettings((s) => ({ ...s, dnd: next }));
    setDndOnServer(next).catch((err) => {
      console.warn("[notifications] dnd sync failed, rolling back:", err);
      setSettings((s) => ({ ...s, dnd: !next }));
    });
  }, []);

  const setReadReceipts = useCallback((enabled) => {
    const next = !!enabled;
    setSettings((s) => ({ ...s, readReceipts: next }));
    setReadReceiptsOnServer(next).catch((err) => {
      console.warn("[notifications] read receipts sync failed, rolling back:", err);
      setSettings((s) => ({ ...s, readReceipts: !next }));
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
      setDnd,
      setReadReceipts,
    }),
    [settings, setSoundEnabled, setSoundSample, setDesktopEnabled, setTitleBadgeEnabled, toggleMute, isMuted, setDnd, setReadReceipts]
  );

  return (
    <NotificationSettingsContext.Provider value={value}>
      {children}
    </NotificationSettingsContext.Provider>
  );
}
