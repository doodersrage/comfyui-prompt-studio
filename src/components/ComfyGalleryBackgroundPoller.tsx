"use client";

import { useEffect } from "react";
import { COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery";
import { initBrowserStorage } from "@/lib/browser-storage";
import { hasPendingGalleryPollMeta } from "@/lib/gallery-pending-polls";
import { resumePendingGalleryPolls } from "@/lib/comfyui-gallery-poller";

export default function ComfyGalleryBackgroundPoller() {
  useEffect(() => {
    void initBrowserStorage();

    const resumeIfNeeded = () => {
      if (!hasPendingGalleryPollMeta()) {
        return;
      }
      void import("@/lib/gallery-db-store").then(({ warmGalleryStore }) =>
        warmGalleryStore().then(() => {
          resumePendingGalleryPolls();
        }),
      );
    };

    resumeIfNeeded();

    const onGalleryUpdated = () => {
      resumeIfNeeded();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resumeIfNeeded();
      }
    };

    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdated);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdated);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
