"use client";

import { useEffect, useState } from "react";
import {
  loadWorkspaceMode,
  type WorkspaceMode,
} from "@/lib/workspace-mode";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

/** Live workspace mode for progressive disclosure in tool chrome. */
export function useWorkspaceMode(): WorkspaceMode {
  const [mode, setMode] = useState<WorkspaceMode>("studio");

  useEffect(() => {
    scheduleAfterCommit(() => {
      setMode(loadWorkspaceMode());
    });
    const sync = () => setMode(loadWorkspaceMode());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return mode;
}
