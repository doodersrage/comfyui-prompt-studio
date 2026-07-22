"use client";

import { useEffect, useState } from "react";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import Link from "next/link";
import {
  dismissOnboarding,
  loadOnboardingState,
  type OnboardingStep,
} from "@/lib/onboarding-store";
import { Button } from "@/components/ui/Button";

export default function OnboardingChecklist() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const state = loadOnboardingState();
      setSteps(state);
      setHidden(state.every((step) => step.done));
    });
  }, []);

  if (hidden || steps.every((step) => step.done)) {
    return null;
  }

  const core = steps.filter((step) =>
    [
      "llm-health",
      "comfy-health",
      "import-workflow",
      "first-generate",
      "first-queue",
      "review-gallery",
    ].includes(step.id),
  );
  const chrome = steps.filter((step) =>
    ["discover-palette", "pin-tool", "set-density", "set-workspace"].includes(step.id),
  );

  return (
    <div className="mx-auto mb-6 max-w-3xl rounded-[var(--radius-xl)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--accent-text)]">Getting started</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            dismissOnboarding();
            setHidden(true);
          }}
        >
          Dismiss
        </Button>
      </div>
      <ul className="mt-3 space-y-2">
        {core.map((step) => (
          <li
            key={step.id}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
          >
            <span
              className={
                step.done ? "text-[var(--tint-success-text)]" : "text-[var(--text-muted)]"
              }
            >
              {step.done ? "✓" : "○"}
            </span>
            {step.label}
          </li>
        ))}
      </ul>
      {chrome.some((step) => !step.done) ? (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <p className="type-caption mb-2 text-[var(--text-muted)]">UI tips</p>
          <ul className="space-y-2">
            {chrome.map((step) => (
              <li
                key={step.id}
                className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
              >
                <span
                  className={
                    step.done
                      ? "text-[var(--tint-success-text)]"
                      : "text-[var(--text-muted)]"
                  }
                >
                  {step.done ? "✓" : "○"}
                </span>
                {step.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 type-caption text-[var(--text-muted)]">
        Open{" "}
        <Link
          href="/settings"
          className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
        >
          Settings
        </Link>{" "}
        for health checks, or press{" "}
        <kbd className="rounded border border-[var(--border-default)] px-1">⌘/Ctrl+K</kbd>{" "}
        anytime.
      </p>
    </div>
  );
}
