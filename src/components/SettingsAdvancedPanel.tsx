"use client";

import { useEffect, useState } from "react";
import { ToolSection } from "@/components/ui/ToolPageShell";
import { Button } from "@/components/ui/Button";
import { syncNamespaceToServer } from "@/lib/storage-sync";
import { SETTINGS_CACHE_KEY, type SettingsCache } from "@/lib/settings-cache";
import { PROMPT_HISTORY_KEY } from "@/hooks/usePromptHistory";
import { COMFYUI_GALLERY_KEY } from "@/lib/comfyui-gallery";

type UsageSummary = {
  total: number;
  lastHour: number;
  rateLimited: number;
  avgDurationMs: number;
};

export default function SettingsAdvancedPanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [storageEnabled, setStorageEnabled] = useState(false);
  const storageNamespaces = ["settings-cache", "prompt-history", "comfy-gallery"];

  useEffect(() => {
    void fetch("/api/usage")
      .then((response) => response.json())
      .then((data: { summary?: UsageSummary }) => setUsage(data.summary ?? null))
      .catch(() => setUsage(null));
    void fetch("/api/health")
      .then((response) => response.json())
      .then((data: { storage?: { enabled?: boolean } }) =>
        setStorageEnabled(Boolean(data.storage?.enabled)),
      )
      .catch(() => setStorageEnabled(false));
  }, []);

  async function runServerBatch() {
    setStatus(null);
    try {
      const response = await fetch("/api/scheduled-batch/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "random-scene", count: 3, autoQueueComfyUi: false }),
      });
      const data = (await response.json()) as { prompts?: string[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Server batch failed.");
      }
      setStatus(`Server batch generated ${data.prompts?.length ?? 0} prompt(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Server batch failed.");
    }
  }

  async function pushLocalStorageToServer() {
    if (!storageEnabled) {
      setStatus("Set PROMPT_DATA_DIR on the server to enable storage sync.");
      return;
    }
    const settingsRaw = localStorage.getItem(SETTINGS_CACHE_KEY);
    const historyRaw = localStorage.getItem(PROMPT_HISTORY_KEY);
    const galleryRaw = localStorage.getItem(COMFYUI_GALLERY_KEY);
    const tasks: Promise<boolean>[] = [];
    if (settingsRaw) {
      tasks.push(syncNamespaceToServer("settings-cache", JSON.parse(settingsRaw) as SettingsCache));
    }
    if (historyRaw) {
      tasks.push(syncNamespaceToServer("prompt-history", JSON.parse(historyRaw)));
    }
    if (galleryRaw) {
      tasks.push(syncNamespaceToServer("comfy-gallery", JSON.parse(galleryRaw)));
    }
    const results = await Promise.all(tasks);
    setStatus(
      results.every(Boolean)
        ? "Synced local settings, history, and gallery to server storage."
        : "Some namespaces failed to sync.",
    );
  }

  return (
    <>
      <ToolSection title="API usage">
        {usage ? (
          <ul className="space-y-1 text-sm text-zinc-400">
            <li>Recent requests (in-memory): {usage.total}</li>
            <li>Last hour: {usage.lastHour}</li>
            <li>Rate limited: {usage.rateLimited}</li>
            <li>Average duration: {usage.avgDurationMs}ms</li>
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No API usage recorded yet.</p>
        )}
      </ToolSection>

      <ToolSection title="Server storage">
        <p className="text-sm text-zinc-400">
          Optional file-backed storage when <code className="text-zinc-300">PROMPT_DATA_DIR</code> is
          set on the server. Namespaces: {storageNamespaces.join(", ")}.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Status: {storageEnabled ? "enabled" : "disabled (localStorage only)"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void pushLocalStorageToServer()}>
            Push browser data to server
          </Button>
        </div>
      </ToolSection>

      <ToolSection title="Server scheduled batch">
        <p className="text-sm text-zinc-400">
          Run batch generation on the server via <code className="text-zinc-300">POST /api/scheduled-batch/run</code>.
          Enable automatic runs with <code className="text-zinc-300">SERVER_SCHEDULED_BATCH=true</code>.
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => void runServerBatch()}>
          Run server batch now
        </Button>
      </ToolSection>

      {status ? <p className="text-sm text-emerald-400">{status}</p> : null}
    </>
  );
}
