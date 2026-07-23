"use client";

import { useEffect, useState } from "react";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import Link from "next/link";
import {
  dismissOnboarding,
  isOnboardingChromeStep,
  isOnboardingCoreStep,
  loadOnboardingState,
  type OnboardingStep,
} from "@/lib/onboarding-store";
import { Button } from "@/components/ui/Button";
import { settingsTabHref } from "@/lib/settings-nav";

function StepRow({ step }: { step: OnboardingStep }) {
  const body = (
    <>
      <span
        className={
          step.done ? "text-[var(--tint-success-text)]" : "text-[var(--text-muted)]"
        }
        aria-hidden
      >
        {step.done ? "✓" : "○"}
      </span>
      <span className={step.done ? "text-[var(--text-muted)] line-through" : undefined}>
        {step.label}
      </span>
    </>
  );

  if (step.done || !step.href) {
    return (
      <li className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        {body}
      </li>
    );
  }

  return (
    <li>
      <Link
        href={step.href}
        className="flex items-center gap-2 rounded-[var(--radius-md)] text-sm text-[var(--accent-text)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.99]"
      >
        {body}
      </Link>
    </li>
  );
}

export default function OnboardingChecklist() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const state = loadOnboardingState();
      setSteps(state);
      setHidden(state.every((step) => step.done));
    });
    const refresh = () => {
      const state = loadOnboardingState();
      setSteps(state);
      setHidden(state.every((step) => step.done));
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (hidden || steps.every((step) => step.done)) {
    return null;
  }

  const core = steps.filter((step) => isOnboardingCoreStep(step.id));
  const chrome = steps.filter((step) => isOnboardingChromeStep(step.id));
  const nextOpen = core.find((step) => !step.done);

  return (
    <div className="mx-auto mb-6 max-w-3xl rounded-[var(--radius-xl)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4 shadow-[var(--shadow-surface)]">
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
      {nextOpen?.href ? (
        <p className="mt-2 type-caption text-[var(--text-muted)]">
          Next:{" "}
          <Link
            href={nextOpen.href}
            className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
          >
            {nextOpen.label}
          </Link>
        </p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {core.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ul>
      {chrome.some((step) => !step.done) ? (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <p className="type-caption mb-2 text-[var(--text-muted)]">UI tips</p>
          <ul className="space-y-2">
            {chrome.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 type-caption text-[var(--text-muted)]">
        Prefer one click? Use{" "}
        <Link
          href={settingsTabHref("overview")}
          className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
        >
          Settings → Heal & ready
        </Link>
        , or press{" "}
        <kbd className="rounded border border-[var(--border-default)] px-1">⌘/Ctrl+K</kbd>{" "}
        anytime.
      </p>
    </div>
  );
}
