"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { ToolSection } from "@/components/ui/ToolPageShell";
import type { UserScheduledCampaign } from "@/lib/auth/types";
import ProfileSecurityPanel from "@/components/profile/ProfileSecurityPanel";
import type { SharedPresetEntry } from "@/lib/shared-preset-store";

const DEFAULT_CAMPAIGN: UserScheduledCampaign = {
  enabled: false,
  target: "random-scene",
  count: 3,
  intervalMin: 60,
  autoQueueComfyUi: false,
};

export default function ProfilePanel() {
  const { user, refresh, authEnabled } = useAuth();
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [comfyUiUrl, setComfyUiUrl] = useState("");
  const [campaign, setCampaign] = useState<UserScheduledCampaign>(DEFAULT_CAMPAIGN);
  const [exportEnabled, setExportEnabled] = useState(false);
  const [sharedPresets, setSharedPresets] = useState<SharedPresetEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    const response = await fetch("/api/auth/profile", { cache: "no-store" });
    const data = (await response.json()) as {
      user?: {
        comfyUiUrl?: string;
        scheduledCampaign?: UserScheduledCampaign;
        exportEnabled?: boolean;
      };
      error?: string;
    };
    if (response.ok && data.user) {
      setComfyUiUrl(data.user.comfyUiUrl ?? "");
      setCampaign(data.user.scheduledCampaign ?? DEFAULT_CAMPAIGN);
      setExportEnabled(Boolean(data.user.exportEnabled));
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    void fetch("/api/shared-presets")
      .then((response) => response.json())
      .then((data: { presets?: SharedPresetEntry[] }) => setSharedPresets(data.presets ?? []))
      .catch(() => setSharedPresets([]));
  }, [loadProfile]);

  async function saveProfile() {
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPassword || undefined,
          password: password || undefined,
          comfyUiUrl,
          scheduledCampaign: campaign,
          exportEnabled,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Save failed.");
      }
      setPassword("");
      setCurrentPassword("");
      setStatus("Profile saved.");
      await refresh();
      await loadProfile();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!authEnabled) {
    return (
      <ToolSection title="Profile">
        <p className="text-sm text-zinc-400">Sign-in is disabled. Profile settings are unavailable.</p>
      </ToolSection>
    );
  }

  if (!user) {
    return (
      <ToolSection title="Profile">
        <p className="text-sm text-zinc-400">Sign in to manage your account.</p>
      </ToolSection>
    );
  }

  return (
    <div className="space-y-8">
      {status ? (
        <p className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-sm text-violet-100">
          {status}
        </p>
      ) : null}

      <ToolSection title="Account">
        <p className="mb-4 text-sm text-zinc-400">
          Signed in as <span className="text-zinc-100">{user.username}</span> ({user.role})
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="type-caption text-zinc-500">Current password</span>
            <TextInput
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="type-caption text-zinc-500">New password</span>
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>
      </ToolSection>

      <ToolSection title="ComfyUI override">
        <p className="mb-3 text-sm text-zinc-400">
          Optional personal ComfyUI URL. Overrides Settings when queueing from your account.
        </p>
        <TextInput
          value={comfyUiUrl}
          onChange={(event) => setComfyUiUrl(event.target.value)}
          placeholder="http://127.0.0.1:8188"
        />
      </ToolSection>

      <ToolSection title="Scheduled campaign">
        <p className="mb-3 text-sm text-zinc-400">
          Server maintenance runs user campaigns when <code className="text-zinc-300">SERVER_USER_MAINTENANCE=true</code>.
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={campaign.enabled}
            onChange={(event) => setCampaign((prev) => ({ ...prev, enabled: event.target.checked }))}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Enable scheduled campaign
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="type-caption text-zinc-500">Target</span>
            <select
              value={campaign.target}
              onChange={(event) =>
                setCampaign((prev) => ({
                  ...prev,
                  target: event.target.value as UserScheduledCampaign["target"],
                }))
              }
              className="ui-input w-full"
            >
              <option value="random-scene">Random scene</option>
              <option value="topics">Topics batch</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="type-caption text-zinc-500">Interval (minutes)</span>
            <TextInput
              type="number"
              value={String(campaign.intervalMin)}
              onChange={(event) =>
                setCampaign((prev) => ({
                  ...prev,
                  intervalMin: Math.max(5, Number(event.target.value) || 60),
                }))
              }
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="type-caption text-zinc-500">Count</span>
            <TextInput
              type="number"
              value={String(campaign.count)}
              onChange={(event) =>
                setCampaign((prev) => ({
                  ...prev,
                  count: Math.max(1, Math.min(12, Number(event.target.value) || 3)),
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2 self-end text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={campaign.autoQueueComfyUi}
              onChange={(event) =>
                setCampaign((prev) => ({ ...prev, autoQueueComfyUi: event.target.checked }))
              }
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
            />
            Auto-queue to ComfyUI
          </label>
        </div>
      </ToolSection>

      <ToolSection title="Server export">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={exportEnabled}
            onChange={(event) => setExportEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Include my synced history/gallery in nightly server exports
        </label>
      </ToolSection>

      {sharedPresets.length > 0 ? (
        <ToolSection title="Shared preset library">
          <p className="mb-3 text-sm text-zinc-400">Read-only presets published by admins.</p>
          <ul className="space-y-2">
            {sharedPresets.map((preset) => (
              <li
                key={preset.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm"
              >
                <p className="font-medium text-zinc-100">{preset.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{preset.hints}</p>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(preset.hints);
                    setStatus(`Copied hints for “${preset.label}”.`);
                  }}
                  className="mt-2 text-xs text-violet-300 hover:text-violet-200"
                >
                  Copy hints
                </button>
              </li>
            ))}
          </ul>
        </ToolSection>
      ) : null}

      <ProfileSecurityPanel />

      <Button type="button" disabled={loading} onClick={() => void saveProfile()}>
        {loading ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}
