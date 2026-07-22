"use client";

import { useEffect } from "react";

export default function GalleryPwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    // Gallery image cache only (v3). Unregister stale shell SWs that hijacked navigations.
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        const script = reg.active?.scriptURL || reg.installing?.scriptURL || "";
        if (script.includes("sw-gallery")) {
          void reg.update();
        }
      }
    });
    void navigator.serviceWorker.register("/sw-gallery.js").catch(() => {
      // Optional PWA — ignore registration failures.
    });
  }, []);

  return null;
}
