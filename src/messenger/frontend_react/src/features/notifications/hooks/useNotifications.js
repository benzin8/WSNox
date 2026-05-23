import { useState, useEffect } from "react";
import { shouldNotify } from "../utils/shouldNotify.js";
import { useNotificationSound } from "./useNotificationSound.js";
import { useNotificationTitle } from "./useNotificationTitle.js";
import { useNotificationDesktop } from "./useNotificationDesktop.js";

/**
 * Главный хук фичи. Подписывается на lastReceivedMessage и распределяет
 * по трём каналам (звук / title / desktop), уважая настройки и mute.
 */
export function useNotifications({ lastReceivedMessage, currentUser, activeChatIdRef, totalUnread, settings }) {
  const [soundTrigger, setSoundTrigger] = useState(0);
  const [desktopPayload, setDesktopPayload] = useState(null);

  useEffect(() => {
    if (!lastReceivedMessage) return;

    const ok = shouldNotify({
      message: lastReceivedMessage,
      currentUser,
      activeChatId: activeChatIdRef.current,
      isDocumentHidden: document.hidden,
      mutedChats: settings.mutedChats,
    });

    if (!ok) return;

    setSoundTrigger((n) => n + 1);
    const senderName =
      lastReceivedMessage.chat_info?.recipient?.name ||
      lastReceivedMessage.chat_info?.name ||
      "Новое сообщение";
    setDesktopPayload({
      title: `Новое сообщение от ${senderName}`,
      chatId: lastReceivedMessage.chat_id,
      ts: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastReceivedMessage]);

  useNotificationSound({
    trigger: soundTrigger,
    enabled: settings.sound.enabled,
    sample: settings.sound.sample,
  });

  useNotificationDesktop({
    notification: desktopPayload,
    enabled: settings.desktop.enabled,
  });

  useNotificationTitle({
    totalUnread,
    enabled: settings.titleBadge.enabled,
  });
}
