"use client";

/**
 * Lightweight connection status for Dashboard / sidebar.
 * Polls /api/health on an idle interval so new installs see LLM + Comfy at a glance.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { settingsTabHref } from "@/lib/settings-nav";

type ChipHealth = {
  llmOk: boolean;
  comfyOk: boolean;
};

const POLL_MS = 60_000;

async function fetchChipHealth(): Promise<ChipHealth> {
  try {
    const response = await fetch("/api/health");
    const data = (await response.json()) as {
      llm?: { ok?: boolean };
      comfyui?: { ok?: boolean };
    };
    return {
      llmOk: Boolean(data.llm?.ok),
      comfyOk: Boolean(data.comfyui?.ok),
    };
  } catch {
    return { llmOk: false, comfyOk: false };
  }
}

function toneClass(ok: boolean | null): string {
  if (ok == null) {
    return "border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-muted)]";
  }
  return ok
    ? "border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]"
    : "border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]";
}

export default function ConnectionHealthChip({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [health, setHealth] = useState<ChipHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchChipHealth().then((next) => {
        if (!cancelled) {
          setHealth(next);
        }
      });
    };
    scheduleAfterCommit(load);
    const id = window.setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const bothOk = health?.llmOk && health?.comfyOk;
  const label =
    health == null
      ? "Checking…"
      : bothOk
        ? "Connected"
        : !health.llmOk && !health.comfyOk
          ? "LLM & Comfy down"
          : !health.llmOk
            ? "LLM unreachable"
            : "ComfyUI unreachable";

  return (
    <Link
      href={settingsTabHref("overview")}
      title="Open Settings → Overview for Heal & ready"
      className={`inline-flex items-center gap-2 rounded-[var(--radius-lg)] border px-2.5 py-1.5 text-[11px] font-medium transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.99] ${toneClass(
        health == null ? null : Boolean(bothOk),
      )}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          health == null
            ? "bg-[var(--text-muted)]"
            : bothOk
              ? "bg-[var(--tint-success-text)]"
              : "bg-[var(--tint-danger-text)]"
        }`}
        aria-hidden
      />
      {compact ? (
        <span>{label}</span>
      ) : (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{label}</span>
          {health ? (
            <span className="font-normal opacity-80">
              LLM {health.llmOk ? "ok" : "—"} · Comfy {health.comfyOk ? "ok" : "—"}
            </span>
          ) : null}
        </span>
      )}
    </Link>
  );
}
