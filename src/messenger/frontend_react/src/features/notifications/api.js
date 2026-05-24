import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
});

export async function fetchNotificationPreferences() {
  const { data } = await axios.get(
    `${API_BASE}/api/v1/notifications/preferences`,
    getAuthConfig()
  );
  return data;
}

export async function setDndOnServer(enabled) {
  const { data } = await axios.put(
    `${API_BASE}/api/v1/notifications/dnd`,
    { enabled },
    getAuthConfig()
  );
  return data;
}

export async function setChatMuteOnServer(chatId, muted) {
  const { data } = await axios.put(
    `${API_BASE}/api/v1/notifications/chats/${chatId}/mute`,
    { muted },
    getAuthConfig()
  );
  return data;
}

export async function setReadReceiptsOnServer(enabled) {
  const { data } = await axios.put(
    `${API_BASE}/api/v1/notifications/read-receipts`,
    { enabled },
    getAuthConfig()
  );
  return data;
}
