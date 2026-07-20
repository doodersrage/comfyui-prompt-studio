"use client";

import { useEffect } from "react";

export default function GalleryPwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    void navigator.serviceWorker.register("/sw-gallery.js").catch(() => {
      // Optional PWA — ignore registration failures.
    });
  }, []);

  return null;
}
