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

  return (
    <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-violet-100">Getting started</p>
        <Button size="sm" variant="ghost" onClick={() => { dismissOnboarding(); setHidden(true); }}>
          Dismiss
        </Button>
      </div>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2 text-sm text-zinc-300">
            <span className={step.done ? "text-emerald-400" : "text-zinc-600"}>{step.done ? "✓" : "○"}</span>
            {step.label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-zinc-500">
        Open <Link href="/settings" className="text-violet-300">Settings</Link> to run health checks and import workflows.
      </p>
    </div>
  );
}
