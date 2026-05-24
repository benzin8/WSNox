import { Bell, BellOff } from "lucide-react";
import { useNotificationSettings } from "../hooks/useNotificationSettings.js";

export function ChatMuteToggle({ chatId }) {
  const { isMuted, toggleMute } = useNotificationSettings();
  if (chatId == null) return null;

  const muted = isMuted(chatId);

  return (
    <button
      onClick={(e) => {
        toggleMute(chatId);
        // Drop focus so iOS Safari doesn't keep the :hover style stuck
        // after the tap — that's what makes the icon look "frozen".
        e.currentTarget.blur();
      }}
      title={muted ? "Включить уведомления" : "Отключить уведомления"}
      className={`p-1 transition-colors ${muted ? "text-lime-400" : "text-zinc-400"} [@media(hover:hover)]:hover:text-lime-400`}
    >
      {muted ? <BellOff size={18} /> : <Bell size={18} />}
    </button>
  );
}
