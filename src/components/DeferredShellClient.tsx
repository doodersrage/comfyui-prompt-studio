"use client";

import dynamic from "next/dynamic";

const CommandPalette = dynamic(() => import("@/components/CommandPalette"), {
  ssr: false,
});

const ScheduledBatchRunner = dynamic(() => import("@/components/ScheduledBatchRunner"), {
  ssr: false,
});

const KeyboardShortcuts = dynamic(() => import("@/components/KeyboardShortcuts"), {
  ssr: false,
});

const GalleryPwaRegister = dynamic(() => import("@/components/GalleryPwaRegister"), {
  ssr: false,
});

export default function DeferredShellClient() {
  return (
    <>
      <ScheduledBatchRunner />
      <KeyboardShortcuts />
      <CommandPalette />
      <GalleryPwaRegister />
    </>
  );
}
