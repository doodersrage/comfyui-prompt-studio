"use client";

import { useEffect } from "react";

/**
 * Removes the experimental PWA service worker. It cached HTML/JS responses and
 * conflicted with Next.js navigation, causing reload loops in dev and after updates.
 */
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    })();
  }, []);

  return null;
}
