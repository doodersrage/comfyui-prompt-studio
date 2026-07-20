"use client";

import { useEffect, useRef } from "react";
import {
  clearGalleryHandoff,
  fetchHandoffImageFile,
  loadGalleryHandoff,
  type GalleryHandoffPayload,
} from "@/lib/gallery-handoff";

export function useGalleryHandoff(
  target: GalleryHandoffPayload["target"],
  onReady: (payload: {
    prompt: string;
    negativePrompt?: string;
    model?: string;
    improveIntent?: string;
    queueParams?: GalleryHandoffPayload["queueParams"];
    file: File | null;
    previewUrl: string | null;
    payload: GalleryHandoffPayload;
  }) => void,
): void {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "gallery") {
      return;
    }

    const payload = loadGalleryHandoff(target);
    if (!payload) {
      return;
    }

    appliedRef.current = true;

    void (async () => {
      let file: File | null = null;
      let previewUrl: string | null = null;
      try {
        file = await fetchHandoffImageFile(payload);
        previewUrl = file ? URL.createObjectURL(file) : payload.imageUrl ?? null;
      } catch {
        previewUrl = payload.imageUrl ?? null;
      }

      onReady({
        prompt: payload.prompt,
        negativePrompt: payload.negativePrompt,
        model: payload.model,
        improveIntent: payload.improveIntent,
        queueParams: payload.queueParams,
        file,
        previewUrl,
        payload,
      });
      clearGalleryHandoff();
    })();
  }, [target, onReady]);
}
