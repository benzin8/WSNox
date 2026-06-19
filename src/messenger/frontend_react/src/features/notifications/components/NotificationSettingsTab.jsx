import { useState } from "react";
import { Volume2 } from "lucide-react";
import { useNotificationSettings } from "../hooks/useNotificationSettings.js";
import { usePushSubscription } from "../hooks/usePushSubscription.js";
import { TONES } from "../constants.js";
import { playTone } from "../audio/tones.js";
import { isDesktopNotificationSupported, getDesktopPermission } from "../utils/permissions.js";
import { isIosSafariNotStandalone } from "../utils/platform.js";

const ROW_STYLE = {
  background: "color-mix(in oklab, var(--color-zinc-800) 30%, transparent)",
  border: "1px solid color-mix(in oklab, var(--color-zinc-700) 60%, transparent)",
};

function ToggleRow({ label, desc, on, onChange, disabled = false }) {
  const handle = () => { if (!disabled) onChange?.(!on); };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      className="flex items-center gap-3 px-3.5 rounded-2xl text-left disabled:opacity-50"
      style={{ minHeight: 54, ...ROW_STYLE }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-100">{label}</div>
        {desc && <div className="text-[11px] text-zinc-500 mt-0.5">{desc}</div>}
      </div>
      <span
        className="relative shrink-0 rounded-full"
        style={{ width: 44, height: 26, background: on ? "var(--color-lime-400)" : "var(--color-zinc-700)" }}
        aria-hidden
      >
        <span
          className="absolute top-0.5 rounded-full bg-white"
          style={{
            width: 22,
            height: 22,
            left: on ? 20 : 2,
            boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
          }}
        />
      </span>
    </button>
  );
}

export function NotificationSettingsTab() {
  const {
    settings,
    setSoundEnabled,
    setSoundSample,
    setDesktopEnabled,
    setTitleBadgeEnabled,
    setDnd,
    setReadReceipts,
  } = useNotificationSettings();

  const push = usePushSubscription();
  const [pushHint, setPushHint] = useState("");
  const [desktopHint, setDesktopHint] = useState("");
  const supported = isDesktopNotificationSupported();
  const permission = getDesktopPermission();

  const handleDesktopToggle = async (enabled) => {
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

  const handlePushToggle = async (enabled) => {
    setPushHint("");
    if (enabled) {
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
    <div className="flex flex-col gap-2">
      <ToggleRow
        label="Не беспокоить"
        desc="Полностью отключает push, пока включено."
        on={!!settings.dnd}
        onChange={setDnd}
      />

      <ToggleRow
        label="Отметки о прочтении"
        desc="Показывать, прочитано ли сообщение."
        on={!!settings.readReceipts}
        onChange={setReadReceipts}
      />

      <ToggleRow
        label="Воспроизводить звук"
        desc="Звуковой сигнал при получении сообщений."
        on={settings.sound.enabled}
        onChange={setSoundEnabled}
      />

      {settings.sound.enabled && (
        <div
          className="flex items-center gap-2 px-3.5 py-3 rounded-2xl"
          style={ROW_STYLE}
        >
          <select
            value={settings.sound.sample}
            onChange={(e) => setSoundSample(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60"
          >
            {Object.entries(TONES).map(([key, t]) => (
              <option key={key} value={key}>{t.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => playTone(settings.sound.sample)}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-zinc-700 text-zinc-200 rounded-xl hover:bg-zinc-600"
          >
            <Volume2 size={14} /> Проверить
          </button>
        </div>
      )}

      <ToggleRow
        label="Уведомления браузера"
        desc="Показывать всплывающие уведомления вкладки."
        on={settings.desktop.enabled}
        onChange={handleDesktopToggle}
        disabled={!supported}
      />

      {!supported && (
        <p className="text-xs text-zinc-500 px-3.5 -mt-1">
          Браузер не поддерживает Notification API.
        </p>
      )}
      {supported && permission === "denied" && (
        <p className="text-xs text-red-400 px-3.5 -mt-1">
          Уведомления заблокированы. Разрешите их в настройках сайта.
        </p>
      )}
      {desktopHint && (
        <p className="text-xs text-red-400 px-3.5 -mt-1">{desktopHint}</p>
      )}

      <ToggleRow
        label="Счётчик в заголовке вкладки"
        desc="Например: «(3) WSNox», когда вкладка не активна."
        on={settings.titleBadge.enabled}
        onChange={setTitleBadgeEnabled}
      />

      <ToggleRow
        label="Push-уведомления"
        desc="Получать пуши, даже когда вкладка закрыта."
        on={push.enabled}
        onChange={handlePushToggle}
        disabled={!push.supported || push.loading}
      />

      {!push.supported && isIosSafariNotStandalone() && (
        <p className="text-xs text-amber-400 leading-snug px-3.5 -mt-1">
          Для пушей на iPhone: нажми <span className="font-semibold">Поделиться</span> в Safari → <span className="font-semibold">«На экран Домой»</span>, потом открой приложение с главного экрана и вернись сюда.
        </p>
      )}
      {!push.supported && !isIosSafariNotStandalone() && (
        <p className="text-xs text-zinc-500 px-3.5 -mt-1">
          Браузер не поддерживает push-уведомления.
        </p>
      )}
      {pushHint && (
        <p className="text-xs text-red-400 px-3.5 -mt-1">{pushHint}</p>
      )}
    </div>
  );
}
