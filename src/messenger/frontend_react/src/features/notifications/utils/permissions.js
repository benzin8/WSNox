export function isDesktopNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * @returns {"granted" | "denied" | "default" | "unsupported"}
 */
export function getDesktopPermission() {
  if (!isDesktopNotificationSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Запрашивает permission у юзера. Возвращает финальное значение.
 * Не бросает; если API нет — резолвит "unsupported".
 */
export async function requestDesktopPermission() {
  if (!isDesktopNotificationSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
