/**
 * Решает, нужно ли вообще уведомлять пользователя про входящее сообщение.
 *
 * @param {object} args
 * @param {object|null} args.message       — lastReceivedMessage из useChatSocket
 * @param {object|null} args.currentUser   — { id, ... }
 * @param {number|null} args.activeChatId  — текущий открытый чат
 * @param {boolean} args.isDocumentHidden  — document.hidden
 * @param {number[]} args.mutedChats       — список замьюченных chat_id
 * @returns {boolean}
 */
export function shouldNotify({ message, currentUser, activeChatId, isDocumentHidden, mutedChats }) {
  if (!message || !currentUser) return false;

  if (Number(message.sender_id) === Number(currentUser.id)) return false;

  const isActiveChat = Number(message.chat_id) === Number(activeChatId);
  if (isActiveChat && !isDocumentHidden) return false;

  if (mutedChats.includes(Number(message.chat_id))) return false;

  // Albums fan out as N separate messages; only the first photo (index 0)
  // should ding — the rest are tiles of the same collage.
  const albumIndex = message.attachment_meta?.album_index;
  if (message.album_id && albumIndex != null && albumIndex !== 0) return false;

  return true;
}
