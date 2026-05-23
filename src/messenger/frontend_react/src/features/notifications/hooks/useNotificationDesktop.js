import { useEffect } from "react";
import { isDesktopNotificationSupported, getDesktopPermission } from "../utils/permissions.js";

/**
 * Показывает browser notification при каждом изменении `notification`.
 * `notification = null` на первом mount — защита от холостого срабатывания.
 */
export function useNotificationDesktop({ notification, enabled }) {
  useEffect(() => {
    if (!notification) return;
    if (!enabled) return;
    if (!isDesktopNotificationSupported()) return;
    if (getDesktopPermission() !== "granted") return;

    try {
      const n = new Notification(notification.title, {
        tag: `chat-${notification.chatId}`,
        icon: "/WSNox_logo.svg",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (err) {
      console.warn("[notifications] desktop notification failed:", err);
    }
  }, [notification, enabled]);
}
