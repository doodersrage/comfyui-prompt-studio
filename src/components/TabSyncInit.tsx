"use client";

import { useEffect } from "react";
import { subscribeTabSync } from "@/lib/tab-sync";
import { COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery-storage-meta";

export default function TabSyncInit() {
  useEffect(() => {
    return subscribeTabSync((message) => {
      if (message.type === "gallery-updated") {
        // Other tabs mutate IndexedDB; reload before refreshing UI so deletes stick.
        void import("@/lib/gallery-db-store").then(({ reloadGalleryFromDb }) =>
          reloadGalleryFromDb().finally(() => {
            window.dispatchEvent(new Event(COMFYUI_GALLERY_UPDATED_EVENT));
          }),
        );
      }
      if (message.type === "history-updated") {
        window.dispatchEvent(new Event("prompt-history-updated"));
      }
    });
  }, []);

  return null;
}
