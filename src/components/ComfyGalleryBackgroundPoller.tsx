"use client";

import { useEffect } from "react";
import { COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery";
import { initAppDb } from "@/lib/app-db-init";
import { resumePendingGalleryPolls } from "@/lib/comfyui-gallery-poller";

function deferBackgroundInit(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const idleId = window.requestIdleCallback(callback, { timeout: 2000 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(callback, 300);
  return () => window.clearTimeout(timeoutId);
}

export default function ComfyGalleryBackgroundPoller() {
  useEffect(() => {
    const cancelDeferredInit = deferBackgroundInit(() => {
      void initAppDb().then(() => {
        resumePendingGalleryPolls();
      });
    });

    const onGalleryUpdated = () => {
      resumePendingGalleryPolls();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resumePendingGalleryPolls();
      }
    };

    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdated);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelDeferredInit();
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdated);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
