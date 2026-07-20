"use client";

import { useEffect } from "react";
import { COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery";
import { warmGalleryStore } from "@/lib/gallery-db-store";
import { prefetchGalleryPage } from "@/lib/gallery-warmup";
import { initBrowserStorage } from "@/lib/browser-storage";
import { resumePendingGalleryPolls } from "@/lib/comfyui-gallery-poller";

export default function ComfyGalleryBackgroundPoller() {
  useEffect(() => {
    prefetchGalleryPage();
    void warmGalleryStore().then(() => {
      resumePendingGalleryPolls();
    });
    void initBrowserStorage();

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
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdated);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
