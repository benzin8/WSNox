import { useEffect } from "react";
import { APP_TITLE } from "../constants.js";

/**
 * Управляет document.title:
 * - enabled + есть непрочитанные + вкладка скрыта → "(N) WSNox"
 * - иначе → "WSNox"
 * - visibilitychange → visible сбрасывает на "WSNox"
 */
export function useNotificationTitle({ totalUnread, enabled }) {
  useEffect(() => {
    function updateTitle() {
      if (enabled && totalUnread > 0 && document.hidden) {
        document.title = `(${totalUnread}) ${APP_TITLE}`;
      } else {
        document.title = APP_TITLE;
      }
    }

    updateTitle();
    document.addEventListener("visibilitychange", updateTitle);
    return () => {
      document.removeEventListener("visibilitychange", updateTitle);
      document.title = APP_TITLE;
    };
  }, [totalUnread, enabled]);
}
