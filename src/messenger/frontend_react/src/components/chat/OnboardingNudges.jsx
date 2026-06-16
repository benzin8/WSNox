import { useEffect, useState } from "react";
import { Camera, Bell, X, ChevronRight } from "lucide-react";
import { useNotificationSettings, usePushSubscription } from "../../features/notifications";
import { isDesktopNotificationSupported } from "../../features/notifications/utils/permissions.js";

const STORAGE_AVATAR = "wsnox.nudge.avatar.dismissed";
const STORAGE_NOTIF = "wsnox.nudge.notif.dismissed";

function readDismissed(key) {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeDismissed(key) {
  try { localStorage.setItem(key, "1"); } catch { /* private mode */ }
}

function Nudge({ icon, title, desc, cta, onAct, onDismiss, busy }) {
  return (
    <div
      className="mx-3 mb-2 rounded-2xl p-3 flex items-start gap-3"
      style={{
        background: "rgba(var(--accent-rgb),0.06)",
        border: "1px solid rgba(var(--accent-rgb),0.20)",
      }}
    >
      <span
        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: "rgba(var(--accent-rgb),0.12)", color: "var(--color-lime-400)" }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        <div className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">{desc}</div>
        <button
          type="button"
          onClick={onAct}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
          style={{ background: "var(--color-lime-400)", color: "#18181b" }}
        >
          {busy ? "…" : cta} <ChevronRight size={13} />
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-zinc-600 hover:text-zinc-300"
        aria-label="Скрыть подсказку"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function OnboardingNudges({ myProfile, onOpenEditProfile }) {
  const { settings, setDnd, setDesktopEnabled } = useNotificationSettings();
  const push = usePushSubscription();

  const [avatarDismissed, setAvatarDismissed] = useState(() => readDismissed(STORAGE_AVATAR));
  const [notifDismissed, setNotifDismissed] = useState(() => readDismissed(STORAGE_NOTIF));
  const [notifBusy, setNotifBusy] = useState(false);

  // If the user uploads an avatar, the nudge should disappear immediately and
  // any saved "dismissed" flag becomes irrelevant — clear it so a later removal
  // re-shows the nudge.
  useEffect(() => {
    if (myProfile?.avatar_thumb_url || myProfile?.avatar_url) {
      try { localStorage.removeItem(STORAGE_AVATAR); } catch { /* noop */ }
      setAvatarDismissed(false);
    }
  }, [myProfile?.avatar_thumb_url, myProfile?.avatar_url]);

  const needsAvatar = !myProfile?.avatar_thumb_url && !myProfile?.avatar_url;
  const notifReallyOn = !settings.dnd && (push.enabled || settings.desktop.enabled);
  const desktopSupported = isDesktopNotificationSupported();
  const pushSupported = push.supported;
  const needsNotif = !notifReallyOn && (desktopSupported || pushSupported);

  const showAvatar = needsAvatar && !avatarDismissed;
  const showNotif = needsNotif && !notifDismissed;

  if (!showAvatar && !showNotif) return null;

  const enableNotifications = async () => {
    setNotifBusy(true);
    try {
      if (settings.dnd) await setDnd(false);
      let success = false;
      if (pushSupported) {
        const result = await push.subscribe();
        success = result === "granted" || result === "ok" || push.enabled;
      }
      if (!success && desktopSupported) {
        const result = await setDesktopEnabled(true);
        success = result === "granted";
      }
      if (success) {
        writeDismissed(STORAGE_NOTIF);
        setNotifDismissed(true);
      }
    } finally {
      setNotifBusy(false);
    }
  };

  const dismissAvatar = () => { writeDismissed(STORAGE_AVATAR); setAvatarDismissed(true); };
  const dismissNotif = () => { writeDismissed(STORAGE_NOTIF); setNotifDismissed(true); };

  return (
    <div className="mt-2">
      {showAvatar && (
        <Nudge
          icon={<Camera size={17} />}
          title="Добавьте фото профиля"
          desc="Собеседникам проще вас узнавать — а вам легче находить себя в групповых чатах."
          cta="Загрузить фото"
          onAct={() => { onOpenEditProfile?.(); }}
          onDismiss={dismissAvatar}
        />
      )}
      {showNotif && (
        <Nudge
          icon={<Bell size={17} />}
          title="Включите уведомления"
          desc="Не пропускайте важные сообщения, даже когда вкладка свёрнута."
          cta="Включить"
          onAct={enableNotifications}
          onDismiss={dismissNotif}
          busy={notifBusy}
        />
      )}
    </div>
  );
}
