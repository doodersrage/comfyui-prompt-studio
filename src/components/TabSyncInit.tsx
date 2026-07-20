"use client";

import { useEffect } from "react";
import { subscribeTabSync } from "@/lib/tab-sync";
import { COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery-storage-meta";

export default function TabSyncInit() {
  useEffect(() => {
    return subscribeTabSync((message) => {
      if (message.type === "gallery-updated") {
        window.dispatchEvent(new Event(COMFYUI_GALLERY_UPDATED_EVENT));
      }
      if (message.type === "history-updated") {
        window.dispatchEvent(new Event("prompt-history-updated"));
      }
    });
  }, []);

  return null;
}
