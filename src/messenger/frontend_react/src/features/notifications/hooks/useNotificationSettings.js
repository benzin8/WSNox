import { useContext } from "react";
import { NotificationSettingsContext } from "../context/NotificationSettingsContext.jsx";

export function useNotificationSettings() {
  const ctx = useContext(NotificationSettingsContext);
  if (!ctx) {
    throw new Error("useNotificationSettings must be used inside <NotificationSettingsProvider>");
  }
  return ctx;
}
