import { Bell, BellOff } from "lucide-react";
import { useNotificationSettings } from "../hooks/useNotificationSettings.js";

export function ChatMuteToggle({ chatId }) {
  const { isMuted, toggleMute } = useNotificationSettings();
  if (chatId == null) return null;

  const muted = isMuted(chatId);

  return (
    <button
      onClick={() => toggleMute(chatId)}
      title={muted ? "Включить уведомления" : "Отключить уведомления"}
      className="text-zinc-400 hover:text-lime-400 transition-colors p-1"
    >
      {muted ? <BellOff size={18} /> : <Bell size={18} />}
    </button>
  );
}
