import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushSubscription } from "../hooks/usePushSubscription.js";
import { isIosSafariNotStandalone } from "../utils/platform.js";

const DISMISSED_KEY = "push_prompt_dismissed";

export function PushPromptModal() {
  const push = usePushSubscription();
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (push.enabled) return;
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;
    if (!push.supported && !isIosSafariNotStandalone()) return;
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, [push.supported, push.enabled]);

  if (!visible) return null;

  const iosHint = isIosSafariNotStandalone();

  const handleEnable = async () => {
    setHint("");
    setSubmitting(true);
    const result = await push.subscribe();
    setSubmitting(false);
    if (result === "granted") {
      localStorage.setItem(DISMISSED_KEY, "true");
      setVisible(false);
    } else if (result === "denied") {
      setHint("Браузер заблокировал уведомления. Разреши их в настройках сайта.");
    } else if (result === "unsupported") {
      setHint("Браузер не поддерживает push.");
    } else if (result === "not_configured") {
      setHint("Push не настроен на сервере.");
    } else if (result === "default") {
      setHint("Разрешение не выдано.");
    } else {
      setHint("Не удалось подписаться. Попробуй ещё раз.");
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-80 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 transition-colors"
          aria-label="Закрыть"
        >
          <X size={18} />
        </button>

        <div className="w-14 h-14 rounded-full bg-lime-400/15 flex items-center justify-center">
          <Bell size={26} className="text-lime-400" />
        </div>

        <div className="text-center">
          <h3 className="text-lg font-bold text-zinc-100">Включи уведомления</h3>
          <p className="text-sm text-zinc-400 mt-1 leading-snug">
            Чтобы не пропускать сообщения, когда вкладка закрыта или приложение свёрнуто.
          </p>
        </div>

        {iosHint ? (
          <div className="w-full text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded-xl px-3 py-2 leading-snug">
            На iPhone сначала установи приложение: <span className="font-semibold">Поделиться</span> в Safari → <span className="font-semibold">«На экран Домой»</span>. Затем открой с главного экрана.
          </div>
        ) : (
          <button
            onClick={handleEnable}
            disabled={submitting}
            className="w-full bg-lime-400 text-zinc-900 font-semibold text-sm py-2 rounded-xl hover:bg-lime-300 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Подключение..." : "Разрешить"}
          </button>
        )}

        {hint && <p className="text-xs text-red-400 text-center">{hint}</p>}

        <button
          onClick={handleDismiss}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Не сейчас
        </button>
      </div>
    </div>
  );
}
