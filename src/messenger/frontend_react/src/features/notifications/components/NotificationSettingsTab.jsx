import { useState } from "react";
import { Volume2 } from "lucide-react";
import { useNotificationSettings } from "../hooks/useNotificationSettings.js";
import { usePushSubscription } from "../hooks/usePushSubscription.js";
import { TONES } from "../constants.js";
import { playTone } from "../audio/tones.js";
import { isDesktopNotificationSupported, getDesktopPermission } from "../utils/permissions.js";

export function NotificationSettingsTab() {
  const {
    settings,
    setSoundEnabled,
    setSoundSample,
    setDesktopEnabled,
    setTitleBadgeEnabled,
  } = useNotificationSettings();

  const push = usePushSubscription();
  const [pushHint, setPushHint] = useState("");
  const [desktopHint, setDesktopHint] = useState("");
  const supported = isDesktopNotificationSupported();
  const permission = getDesktopPermission();

  const handleDesktopToggle = async (e) => {
    const enabled = e.target.checked;
    setDesktopHint("");
    const result = await setDesktopEnabled(enabled);
    if (enabled && result !== "granted") {
      if (result === "denied") {
        setDesktopHint("Браузер блокирует уведомления. Разрешите их в настройках сайта.");
      } else if (result === "unsupported") {
        setDesktopHint("Браузер не поддерживает Notification API.");
      } else if (result === "default") {
        setDesktopHint("Уведомления не разрешены.");
      }
    }
  };

  const handlePushToggle = async (e) => {
    setPushHint("");
    if (e.target.checked) {
      const result = await push.subscribe();
      if (result === "denied") {
        setPushHint("Браузер блокирует уведомления. Разрешите их в настройках сайта.");
      } else if (result === "unsupported") {
        setPushHint("Браузер не поддерживает push-уведомления.");
      } else if (result === "not_configured") {
        setPushHint("Push-уведомления не настроены на сервере.");
      } else if (result === "error") {
        setPushHint("Не удалось подписаться на push-уведомления.");
      }
    } else {
      await push.unsubscribe();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Звук */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
          <input
            type="checkbox"
            checked={settings.sound.enabled}
            onChange={(e) => setSoundEnabled(e.target.checked)}
            className="accent-lime-400"
          />
          Воспроизводить звук
        </label>
        <div className="flex items-center gap-2 pl-6">
          <select
            value={settings.sound.sample}
            onChange={(e) => setSoundSample(e.target.value)}
            disabled={!settings.sound.enabled}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all disabled:opacity-50"
          >
            {Object.entries(TONES).map(([key, t]) => (
              <option key={key} value={key}>{t.label}</option>
            ))}
          </select>
          <button
            onClick={() => playTone(settings.sound.sample)}
            disabled={!settings.sound.enabled}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-zinc-700 text-zinc-200 rounded-xl hover:bg-zinc-600 disabled:opacity-50 transition-colors"
          >
            <Volume2 size={14} /> Проверить
          </button>
        </div>
      </div>

      {/* Browser notif */}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
          <input
            type="checkbox"
            checked={settings.desktop.enabled}
            onChange={handleDesktopToggle}
            disabled={!supported}
            className="accent-lime-400"
          />
          Показывать уведомления браузера
        </label>
        {!supported && (
          <p className="pl-6 text-xs text-zinc-500">
            Браузер не поддерживает Notification API.
          </p>
        )}
        {supported && permission === "denied" && (
          <p className="pl-6 text-xs text-red-400">
            Уведомления заблокированы. Разрешите их в настройках сайта.
          </p>
        )}
        {desktopHint && (
          <p className="pl-6 text-xs text-red-400">{desktopHint}</p>
        )}
      </div>

      {/* Title badge */}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
          <input
            type="checkbox"
            checked={settings.titleBadge.enabled}
            onChange={(e) => setTitleBadgeEnabled(e.target.checked)}
            className="accent-lime-400"
          />
          Считать непрочитанные в заголовке вкладки
        </label>
        <p className="pl-6 text-[10px] text-zinc-500">
          Например: «(3) WSNox» когда вкладка не активна.
        </p>
      </div>

      {/* Push notifications */}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
          <input
            type="checkbox"
            checked={push.enabled}
            onChange={handlePushToggle}
            disabled={!push.supported || push.loading}
            className="accent-lime-400"
          />
          Push-уведомления
        </label>
        <p className="pl-6 text-[10px] text-zinc-500">
          Получайте уведомления даже когда вкладка закрыта (на Android и в PWA).
        </p>
        {!push.supported && (
          <p className="pl-6 text-xs text-zinc-500">
            Браузер не поддерживает push-уведомления.
          </p>
        )}
        {pushHint && (
          <p className="pl-6 text-xs text-red-400">{pushHint}</p>
        )}
      </div>
    </div>
  );
}
