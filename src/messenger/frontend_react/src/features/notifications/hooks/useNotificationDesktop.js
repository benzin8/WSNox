import { useEffect } from "react";
import { isDesktopNotificationSupported, getDesktopPermission } from "../utils/permissions.js";

/**
 * Показывает browser notification при каждом изменении `notification`.
 * `notification = null` на первом mount — защита от холостого срабатывания.
 */
export function useNotificationDesktop({ notification, enabled }) {
  useEffect(() => {
    if (!notification) return;
    if (!enabled) {
      console.debug("[notifications] desktop skipped: disabled by user");
      return;
    }
    if (!isDesktopNotificationSupported()) {
      console.debug("[notifications] desktop skipped: API unsupported");
      return;
    }
    const perm = getDesktopPermission();
    if (perm !== "granted") {
      console.debug("[notifications] desktop skipped: permission =", perm);
      return;
    }

    try {
      const n = new Notification(notification.title, {
        tag: `chat-${notification.chatId}`,
        icon: "/WSNox_logo.svg",
      });
      console.debug("[notifications] desktop shown:", notification.title);
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (err) {
      console.warn("[notifications] desktop notification failed:", err);
    }
  }, [notification, enabled]);
}
