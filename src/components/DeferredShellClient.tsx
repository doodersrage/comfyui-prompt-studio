"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

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

const GlobalToastHost = dynamic(() => import("@/components/GlobalToastHost"), {
  ssr: false,
});

const WorkspaceWelcome = dynamic(() => import("@/components/WorkspaceWelcome"), {
  ssr: false,
});

function scheduleIdle(callback: () => void, timeoutMs: number): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, Math.min(timeoutMs, 1500));
  return () => window.clearTimeout(id);
}

export default function DeferredShellClient() {
  const [shellReady, setShellReady] = useState(false);
  const [batchEnabled, setBatchEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const enableShell = () => {
      if (!cancelled) {
        setShellReady(true);
      }
    };

    void import("@/lib/scheduled-batch").then(({ loadScheduledBatchConfig }) => {
      if (cancelled) {
        return;
      }
      if (loadScheduledBatchConfig().enabled) {
        setBatchEnabled(true);
      }
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        enableShell();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: true });
    const cancelIdle = scheduleIdle(enableShell, 2500);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKeyDown);
      cancelIdle();
    };
  }, []);

  return (
    <>
      {batchEnabled || shellReady ? <ScheduledBatchRunner /> : null}
      {shellReady ? (
        <>
          <KeyboardShortcuts />
          <CommandPalette />
          <GalleryPwaRegister />
          <GlobalToastHost />
          <WorkspaceWelcome />
        </>
      ) : null}
    </>
  );
}
