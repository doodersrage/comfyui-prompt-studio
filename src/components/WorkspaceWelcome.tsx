"use client";

import { useEffect, useState } from "react";
import {
  WORKSPACE_MODE_OPTIONS,
  hasChosenWorkspaceMode,
  saveWorkspaceMode,
  type WorkspaceMode,
} from "@/lib/workspace-mode";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { Button, ButtonLink } from "@/components/ui/Button";
import { runHealAndReady } from "@/lib/first-run-setup";
import { markOnboardingSetWorkspace } from "@/lib/onboarding-hooks";
import { resolveGenerateEmptyCta } from "@/lib/empty-cta";

type WelcomePhase = "workspace" | "setup" | "ready";

/** One-time welcome: workspace density → Heal & ready → Open Generate. */
export default function WorkspaceWelcome() {
  const [phase, setPhase] = useState<WelcomePhase | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [generateCta, setGenerateCta] = useState({ label: "Open Generate", href: "/" });

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (!hasChosenWorkspaceMode()) {
        setPhase("workspace");
      }
    });
  }, []);

  if (!phase) {
    return null;
  }

  function choose(mode: WorkspaceMode) {
    saveWorkspaceMode(mode);
    markOnboardingSetWorkspace();
    setPhase("setup");
  }

  function finishWelcome() {
    setGenerateCta(resolveGenerateEmptyCta());
    setPhase("ready");
  }

  async function heal() {
    setBusy(true);
    setSetupMessage(null);
    try {
      const result = await runHealAndReady();
      setSetupMessage(result.message);
      finishWelcome();
    } catch (err) {
      setSetupMessage(err instanceof Error ? err.message : "Heal failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[color-mix(in_oklab,var(--bg-base)_55%,transparent)] p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-welcome-title"
    >
      <div className="w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-[0_24px_80px_-40px_color-mix(in_oklab,var(--bg-base)_70%,transparent)]">
        {phase === "workspace" ? (
          <>
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
          </>
        ) : null}

        {phase === "setup" ? (
          <>
            <p className="type-overline text-[var(--text-muted)]">Step 2 of 3</p>
            <h2
              id="workspace-welcome-title"
              className="type-title mt-2 text-[var(--text-primary)]"
            >
              Connect & ready
            </h2>
            <p className="type-body mt-2 text-[var(--text-secondary)]">
              One click enables system workflows, adapts loader maps from ComfyUI when
              reachable, and checks LLM + Comfy health. You can skip and finish later
              from Settings → Overview.
            </p>
            {setupMessage ? (
              <p className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-2 type-caption text-[var(--text-muted)]">
                {setupMessage}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={finishWelcome}>
                Skip for now
              </Button>
              <Button
                type="button"
                size="sm"
                loading={busy}
                loadingLabel="Healing…"
                onClick={() => void heal()}
              >
                Heal & ready
              </Button>
            </div>
          </>
        ) : null}

        {phase === "ready" ? (
          <>
            <p className="type-overline text-[var(--text-muted)]">Ready</p>
            <h2
              id="workspace-welcome-title"
              className="type-title mt-2 text-[var(--text-primary)]"
            >
              You&apos;re set to generate
            </h2>
            <p className="type-body mt-2 text-[var(--text-secondary)]">
              {setupMessage ??
                "Open Generate for your first prompt, then Send to ComfyUI when you're ready."}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPhase(null)}>
                Close
              </Button>
              <ButtonLink
                href={generateCta.href}
                variant="primary"
                size="sm"
                onClick={() => setPhase(null)}
              >
                {generateCta.label}
              </ButtonLink>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
