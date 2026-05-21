import { useState, useEffect } from 'react';
import { apiClient } from '@/shared/lib/api-client';

export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // start loading until we check

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsLoading(false);
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      setIsSubscribed(!!existing);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const { data } = await apiClient.get<{ publicKey: string }>('/push/vapid-public-key');

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });

      const sub = subscription.toJSON();
      await apiClient.post('/push/subscribe', { endpoint: sub.endpoint, keys: sub.keys });
      setIsSubscribed(true);
    } catch (err) {
      console.error('[push] subscribe error', err);
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!('serviceWorker' in navigator)) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await apiClient.delete('/push/unsubscribe', { data: { endpoint: existing.endpoint } });
        await existing.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('[push] unsubscribe error', err);
    } finally {
      setIsLoading(false);
    }
  };

  return { isSubscribed, isLoading, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0))).buffer as ArrayBuffer;
}
