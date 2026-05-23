import { useEffect, useRef } from "react";
import { isDesktopNotificationSupported, getDesktopPermission } from "../utils/permissions.js";

/**
 * Показывает browser notification при каждом изменении `notification`.
 * Не вызывает уведомление на первом mount.
 */
export function useNotificationDesktop({ notification, enabled }) {
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!enabled || !notification) return;
    if (!isDesktopNotificationSupported()) return;
    if (getDesktopPermission() !== "granted") return;

    try {
      const n = new Notification(notification.title, {
        tag: `chat-${notification.chatId}`,
        icon: "/logo.svg",
        silent: true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // permission отозван на лету / любой другой сбой — молча
    }
  }, [notification, enabled]);
}
