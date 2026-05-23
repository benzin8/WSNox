import { useState, useCallback, useEffect } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Hook to manage Web Push subscription lifecycle.
 * Returns { supported, enabled, loading, subscribe, unsubscribe }.
 */
export function usePushSubscription() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if push is supported and if there's an existing subscription
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);

    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        setEnabled(!!sub);
      });
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported) return "unsupported";
    setLoading(true);
    try {
      // Fetch VAPID public key from backend
      const { data } = await axios.get(`${API_BASE}/api/v1/push/vapid-public-key`);
      const vapidKey = data.public_key;
      if (!vapidKey) {
        setLoading(false);
        return "not_configured";
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Request notification permission if needed
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setLoading(false);
        return permission === "denied" ? "denied" : "default";
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = subscription.toJSON();

      // Send subscription to backend
      await axios.post(
        `${API_BASE}/api/v1/push/subscribe`,
        {
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
        getAuthConfig()
      );

      setEnabled(true);
      return "granted";
    } catch (err) {
      console.error("[push] subscribe failed:", err);
      return "error";
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const subJson = subscription.toJSON();

        // Notify backend
        await axios.delete(`${API_BASE}/api/v1/push/subscribe`, {
          ...getAuthConfig(),
          data: {
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
          },
        });

        await subscription.unsubscribe();
      }
      setEnabled(false);
    } catch (err) {
      console.error("[push] unsubscribe failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { supported, enabled, loading, subscribe, unsubscribe };
}
