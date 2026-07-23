"use client";

/**
 * First-run / empty-state banner when Comfy is down or system workflows are off.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { loadSettingsCache } from "@/lib/settings-cache";
import { enableSystemWorkflowsAndHeal } from "@/lib/first-run-setup";
import { settingsTabHref } from "@/lib/settings-nav";
import { settingsComfyUiSectionHref } from "@/lib/settings-comfyui-nav";
import { Button } from "@/components/ui/Button";
import { readBrowserValue, writeBrowserValue } from "@/lib/browser-storage";

const DISMISS_KEY = "comfy-setup-readiness-dismiss-v1";

type Readiness = {
  comfyOk: boolean | null;
  systemWorkflows: boolean;
};

export default function SetupReadinessBanner({
  toolLabel = "Generate",
}: {
  toolLabel?: string;
}) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setDismissed(Boolean(readBrowserValue<boolean>(DISMISS_KEY)));
      const shared = loadSettingsCache().shared;
      setReadiness({
        comfyOk: null,
        systemWorkflows: shared.useSystemWorkflows === true,
      });
    });
    let cancelled = false;
    void fetch("/api/health")
      .then((response) => response.json())
      .then((data: { comfyui?: { ok?: boolean } }) => {
        if (cancelled) {
          return;
        }
        const shared = loadSettingsCache().shared;
        setReadiness({
          comfyOk: Boolean(data.comfyui?.ok),
          systemWorkflows: shared.useSystemWorkflows === true,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        const shared = loadSettingsCache().shared;
        setReadiness({
          comfyOk: false,
          systemWorkflows: shared.useSystemWorkflows === true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || !readiness) {
    return null;
  }

  const comfyDown = readiness.comfyOk === false;
  const needsSystemWf = !readiness.systemWorkflows;
  if (!comfyDown && !needsSystemWf) {
    return null;
  }

  return (
    <div className="mb-4 rounded-[var(--radius-xl)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4 shadow-[var(--shadow-surface)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-[var(--accent-text)]">
            Finish setup before {toolLabel}
          </p>
          <ul className="type-caption space-y-1 text-[var(--text-secondary)]">
            {comfyDown ? (
              <li>
                ComfyUI is unreachable — check the URL in{" "}
                <Link
                  href={settingsComfyUiSectionHref("connection")}
                  className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
                >
                  Settings → Connection
                </Link>
                .
              </li>
            ) : null}
            {needsSystemWf ? (
              <li>
                System workflows are off — enable them for scaffolds without importing a
                pack first.
              </li>
            ) : null}
          </ul>
          {message ? (
            <p className="type-caption text-[var(--text-muted)]">{message}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {needsSystemWf ? (
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              loadingLabel="Enabling…"
              onClick={() => {
                setBusy(true);
                void enableSystemWorkflowsAndHeal().then((result) => {
                  setBusy(false);
                  setMessage(result.message);
                  setReadiness((prev) =>
                    prev
                      ? {
                          ...prev,
                          systemWorkflows: true,
                          comfyOk: result.comfyOk ? true : prev.comfyOk,
                        }
                      : prev,
                  );
                });
              }}
            >
              Enable system workflows
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              writeBrowserValue(DISMISS_KEY, true);
              setDismissed(true);
            }}
          >
            Dismiss
          </Button>
          <Link
            href={settingsTabHref("overview")}
            className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
          >
            Heal & ready
          </Link>
        </div>
      </div>
    </div>
  );
}
