/* Service Worker — push notifications for WSNox */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "WSNox", body: event.data.text() };
  }

  const title = payload.title || "WSNox";
  const options = {
    body: payload.body || "",
    icon: "/WSNox_logo.svg",
    badge: "/WSNox_logo.svg",
    tag: payload.chat_id ? `chat-${payload.chat_id}` : "wsnox",
    data: {
      chat_id: payload.chat_id,
      sender_id: payload.sender_id,
      url: "/chat",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || "/chat";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes("/chat") && "focus" in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
