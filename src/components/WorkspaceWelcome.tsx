"use client";

import { useEffect, useState } from "react";
import {
  WORKSPACE_MODE_OPTIONS,
  hasChosenWorkspaceMode,
  saveWorkspaceMode,
  type WorkspaceMode,
} from "@/lib/workspace-mode";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { Button } from "@/components/ui/Button";

/** One-time welcome: choose Simple / Studio / Full before the catalog overwhelms. */
export default function WorkspaceWelcome() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setOpen(!hasChosenWorkspaceMode());
    });
  }, []);

  if (!open) {
    return null;
  }

  function choose(mode: WorkspaceMode) {
    saveWorkspaceMode(mode);
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[color-mix(in_oklab,var(--bg-base)_55%,transparent)] p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-welcome-title"
    >
      <div className="w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-[0_24px_80px_-40px_color-mix(in_oklab,var(--bg-base)_70%,transparent)]">
        <p className="type-overline text-[var(--text-muted)]">Welcome</p>
        <h2
          id="workspace-welcome-title"
          className="type-title mt-2 text-[var(--text-primary)]"
        >
          How do you want to work?
        </h2>
        <p className="type-body mt-2 text-[var(--text-secondary)]">
          Prompt Studio has many tools. Pick a workspace density — you can change
          this anytime in Profile or the sidebar.
        </p>
        <div className="mt-5 grid gap-2">
          {WORKSPACE_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => choose(option.id)}
              className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-3 text-left transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.99]"
            >
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                {option.label}
              </span>
              <span className="type-caption mt-1 block text-[var(--text-muted)]">
                {option.description}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => choose("studio")}>
            Skip — use Studio
          </Button>
        </div>
      </div>
    </div>
  );
}
