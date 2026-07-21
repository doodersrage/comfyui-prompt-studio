"use client";

import { useEffect, useState } from "react";
import { ToolSection } from "@/components/ui/ToolPageShell";
import { EmptyState } from "@/components/ui/ViewState";
import { Button } from "@/components/ui/Button";
import { syncNamespaceToServer, pullNamespaceFromServer } from "@/lib/storage-sync";
import ObservabilityDashboard from "@/components/ObservabilityDashboard";
import PromptRecipesPanel from "@/components/settings/PromptRecipesPanel";
import NegativeLearnerPanel from "@/components/settings/NegativeLearnerPanel";
import ModelShootoutPanel from "@/components/settings/ModelShootoutPanel";
import { loadSettingsCache, saveSettingsCache, type SettingsCache } from "@/lib/settings-cache";
import { initAppDb } from "@/lib/app-db-init";
import {
  loadPromptHistoryStore,
  savePromptHistoryStore,
} from "@/lib/prompt-history";
import {
  loadComfyGallery,
  saveComfyGalleryAsync,
  type ComfyGalleryEntry,
} from "@/lib/comfyui-gallery";

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
  const [exportPassphrase, setExportPassphrase] = useState("");
  const storageNamespaces = ["settings-cache", "prompt-history", "comfy-gallery"];

  const [llmUsage, setLlmUsage] = useState<{
    last24h: number;
    last24hTokens: number;
    byModel: Record<string, number>;
  } | null>(null);

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
    void fetch("/api/auth/llm-usage")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { summary?: { last24h: number; last24hTokens: number; byModel: Record<string, number> } } | null) =>
        setLlmUsage(data?.summary ?? null),
      )
      .catch(() => setLlmUsage(null));
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
    await initAppDb();
    const settings = loadSettingsCache();
    const history = loadPromptHistoryStore();
    const gallery = loadComfyGallery();
    const tasks: Promise<boolean>[] = [];
    if (settings.tools || settings.shared) {
      tasks.push(syncNamespaceToServer("settings-cache", settings));
    }
    if (history) {
      tasks.push(syncNamespaceToServer("prompt-history", history));
    }
    if (gallery.length > 0) {
      tasks.push(syncNamespaceToServer("comfy-gallery", gallery));
    }
    const results = await Promise.all(tasks);
    setStatus(
      results.every(Boolean)
        ? "Synced local settings, history, and gallery to server storage."
        : "Some namespaces failed to sync.",
    );
  }

  async function pullServerStorageToBrowser() {
    if (!storageEnabled) {
      setStatus("Set PROMPT_DATA_DIR on the server to enable storage sync.");
      return;
    }
    const settings = await pullNamespaceFromServer<SettingsCache>("settings-cache");
    const history = await pullNamespaceFromServer<unknown>("prompt-history");
    const gallery = await pullNamespaceFromServer<ComfyGalleryEntry[]>("comfy-gallery");
    if (settings) {
      saveSettingsCache(settings);
    }
    if (history) {
      savePromptHistoryStore(history as import("@/lib/prompt-history").PromptHistoryEntry[]);
    }
    if (gallery) {
      await saveComfyGalleryAsync(gallery);
    }
    setStatus(
      settings || history || gallery
        ? "Restored server storage into the app database. Reload the page."
        : "No server namespaces found to restore.",
    );
  }

  return (
    <>
      <ToolSection title="LLM usage">
        {llmUsage ? (
          <ul className="space-y-1 text-sm text-zinc-400">
            <li>Last 24h LLM calls: {llmUsage.last24h}</li>
            <li>Estimated tokens: {llmUsage.last24hTokens}</li>
            <li>By model: {Object.entries(llmUsage.byModel).map(([model, count]) => `${model} (${count})`).join(", ") || "—"}</li>
          </ul>
        ) : (
          <EmptyState
            compact
            icon="inbox"
            title="Sign in for LLM usage"
            description="LLM call counts and token estimates are available when authentication is enabled and you are signed in."
            action={{ label: "Open login", href: "/login" }}
          />
        )}
      </ToolSection>

      <ToolSection title="API usage">
        {usage ? (
          <ul className="space-y-1 text-sm text-zinc-400">
            <li>Recent requests (in-memory): {usage.total}</li>
            <li>Last hour: {usage.lastHour}</li>
            <li>Rate limited: {usage.rateLimited}</li>
            <li>Average duration: {usage.avgDurationMs}ms</li>
          </ul>
        ) : (
          <EmptyState
            compact
            icon="inbox"
            title="No API usage recorded yet"
            description="In-memory request stats appear here after the server handles a few API calls."
          />
        )}
      </ToolSection>

      <ToolSection title="Server storage">
        <p className="text-sm text-zinc-400">
          Optional file-backed storage when <code className="text-zinc-300">PROMPT_DATA_DIR</code> is
          set on the server. When signed in, history and gallery sync to your personal namespace under{" "}
          <code className="text-zinc-300">users/&lt;id&gt;/</code>.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Status: {storageEnabled ? "enabled" : "disabled (browser database only)"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void pushLocalStorageToServer()}>
            Push browser data to server
          </Button>
          <Button variant="secondary" onClick={() => void pullServerStorageToBrowser()}>
            Pull server data to browser
          </Button>
        </div>
        {storageEnabled ? (
          <div className="mt-4 space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-950/35 p-3">
            <p className="text-sm text-zinc-400">
              Encrypted server export (sign-in required). Writes a snapshot under your user namespace on the server.
            </p>
            <label className="block space-y-1.5 text-sm">
              <span className="type-caption text-zinc-500">Passphrase (optional — encrypts export)</span>
              <input
                type="password"
                value={exportPassphrase}
                onChange={(event) => setExportPassphrase(event.target.value)}
                className="ui-input w-full max-w-md px-3 py-2"
                placeholder="Leave empty for plain JSON export"
              />
            </label>
            <Button
              variant="secondary"
              onClick={async () => {
                setStatus(null);
                try {
                  const response = await fetch("/api/storage/export", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      passphrase: exportPassphrase.trim() || undefined,
                    }),
                  });
                  const data = (await response.json()) as {
                    error?: string;
                    filename?: string;
                    encrypted?: boolean;
                  };
                  if (!response.ok) {
                    throw new Error(data.error ?? "Export failed.");
                  }
                  setStatus(
                    `Server export saved as ${data.filename ?? "snapshot"}${data.encrypted ? " (encrypted)" : ""}.`,
                  );
                  setExportPassphrase("");
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : "Export failed.");
                }
              }}
            >
              Export my server data
            </Button>
          </div>
        ) : null}
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

      <ToolSection title="Email">
        <p className="text-sm text-zinc-400">
          Requires SMTP env vars and a signed-in user with an email on Profile.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={async () => {
            setStatus(null);
            try {
              const response = await fetch("/api/email/test", { method: "POST" });
              const data = (await response.json()) as { error?: string; to?: string };
              if (!response.ok) {
                throw new Error(data.error ?? "Test email failed.");
              }
              setStatus(`Test email sent to ${data.to ?? "your address"}.`);
            } catch (error) {
              setStatus(error instanceof Error ? error.message : "Test email failed.");
            }
          }}
        >
          Send test email
        </Button>
      </ToolSection>

      <ObservabilityDashboard />

      <PromptRecipesPanel />
      <NegativeLearnerPanel />
      <ModelShootoutPanel />

      {status ? <p className="text-sm text-emerald-400">{status}</p> : null}
    </>
  );
}
