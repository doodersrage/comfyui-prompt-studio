"use client";

import { useEffect } from "react";
import { COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery";
import { initAppDb } from "@/lib/app-db-init";
import { resumePendingGalleryPolls } from "@/lib/comfyui-gallery-poller";

export default function ComfyGalleryBackgroundPoller() {
  useEffect(() => {
    void initAppDb().then(() => {
      resumePendingGalleryPolls();
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
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdated);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
