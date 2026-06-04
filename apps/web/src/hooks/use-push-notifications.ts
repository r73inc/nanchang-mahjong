/**
 * usePushNotifications — Web Push permission flow + API subscription sync.
 *
 * Usage:
 *   const { isSupported, permission, isSubscribed, isLoading,
 *           subscribe, unsubscribe } = usePushNotifications();
 *
 * `subscribe()` — requests Notification permission, gets the VAPID public key
 *   from the API, subscribes via pushManager, and POSTs the subscription to
 *   the server so it can deliver turn notifications.
 *
 * `unsubscribe()` — removes the pushManager subscription and DELETEs it from
 *   the server.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a URL-safe base64 string (VAPID public key) to a Uint8Array. */
function base64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isSupported =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'default',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // On mount: sync the current subscription state from pushManager.
  useEffect(() => {
    if (!isSupported) return;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      } catch {
        // SW not registered yet — safe to ignore
      }
    })();
  }, []);

  /**
   * Request notification permission, subscribe to push, and persist the
   * subscription to the server. No-op if already subscribed or denied.
   */
  const subscribe = useCallback(async (): Promise<void> => {
    if (!isSupported || isLoading) return;
    setIsLoading(true);
    try {
      // 1. Request OS-level notification permission.
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      // 2. Fetch the VAPID public key from the server.
      const { data } = await api.get<{ publicKey: string }>('/push/vapid-public-key');
      if (!data.publicKey) {
        // Push not configured in this environment — silently skip.
        return;
      }

      // 3. Subscribe via the service worker's push manager.
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(data.publicKey),
      });

      // 4. Persist the subscription on the server.
      await api.post('/push/subscribe', pushSub.toJSON());
      setIsSubscribed(true);
    } catch (err) {
      console.error('Push subscribe failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  /** Unsubscribe from push and remove the subscription from the server. */
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSupported || isLoading) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.getSubscription();
      if (pushSub) {
        await pushSub.unsubscribe();
        await api.delete('/push/unsubscribe');
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  return {
    /** true when the browser supports Web Push. */
    isSupported,
    /** Current Notification permission: 'default' | 'granted' | 'denied'. */
    permission,
    /** true when a push subscription is active in this browser. */
    isSubscribed,
    /** true while an async permission / subscribe / unsubscribe is in-flight. */
    isLoading,
    subscribe,
    unsubscribe,
  };
}
