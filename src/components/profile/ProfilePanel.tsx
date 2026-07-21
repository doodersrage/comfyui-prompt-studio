"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { ToolSection } from "@/components/ui/ToolPageShell";
import type { UserScheduledCampaign } from "@/lib/auth/types";
import ProfileSecurityPanel from "@/components/profile/ProfileSecurityPanel";
import ProfileAppearancePanel from "@/components/profile/ProfileAppearancePanel";
import ProfileBackupPanel from "@/components/profile/ProfileBackupPanel";
import type { SharedPresetEntry } from "@/lib/shared-preset-store";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

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
  const [email, setEmail] = useState("");
  const [emailNotifyBatch, setEmailNotifyBatch] = useState(true);
  const [emailNotifySecurity, setEmailNotifySecurity] = useState(true);
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
        email?: string;
        emailNotifyBatch?: boolean;
        emailNotifySecurity?: boolean;
      };
      error?: string;
    };
    if (response.ok && data.user) {
      setComfyUiUrl(data.user.comfyUiUrl ?? "");
      setCampaign(data.user.scheduledCampaign ?? DEFAULT_CAMPAIGN);
      setExportEnabled(Boolean(data.user.exportEnabled));
      setEmail(data.user.email ?? "");
      setEmailNotifyBatch(data.user.emailNotifyBatch !== false);
      setEmailNotifySecurity(data.user.emailNotifySecurity !== false);
    }
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void loadProfile();
      void fetch("/api/shared-presets")
        .then((response) => response.json())
        .then((data: { presets?: SharedPresetEntry[] }) => setSharedPresets(data.presets ?? []))
        .catch(() => setSharedPresets([]));
    });
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
          email,
          emailNotifyBatch,
          emailNotifySecurity,
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
      <div className="space-y-8">
        <ToolSection title="Profile">
          <p className="text-sm text-zinc-400">
            Sign-in is disabled. Account settings are unavailable; appearance still works below.
          </p>
        </ToolSection>
        <ProfileAppearancePanel />
      </div>
    );
  }

  if (!user) {
    return (
      <ToolSection title="Account settings">
        <p className="text-sm text-zinc-400">Loading your profile…</p>
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

      <ToolSection title="Email notifications">
        <p className="mb-3 text-sm text-zinc-400">
          Optional address for batch completion and password-change alerts when SMTP is configured on the server.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm sm:col-span-2">
            <span className="type-caption text-zinc-500">Email</span>
            <TextInput
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={emailNotifyBatch}
              onChange={(event) => setEmailNotifyBatch(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
            />
            Batch & campaign completion
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={emailNotifySecurity}
              onChange={(event) => setEmailNotifySecurity(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
            />
            Password & security updates
          </label>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={async () => {
            setStatus(null);
            try {
              const response = await fetch("/api/email/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to: email.trim() || undefined }),
              });
              const data = (await response.json()) as { error?: string; to?: string };
              if (!response.ok) {
                throw new Error(data.error ?? "Test email failed.");
              }
              setStatus(`Test email sent to ${data.to ?? email}.`);
            } catch (error) {
              setStatus(error instanceof Error ? error.message : "Test email failed.");
            }
          }}
        >
          Send test email
        </Button>
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
          <label className="space-y-2 text-sm">
            <span className="type-caption text-zinc-500">Best-of-N rank (optional)</span>
            <TextInput
              type="number"
              value={campaign.bestOfN ? String(campaign.bestOfN) : ""}
              onChange={(event) =>
                setCampaign((prev) => ({
                  ...prev,
                  bestOfN: event.target.value ? Math.max(2, Number(event.target.value)) : undefined,
                }))
              }
              placeholder="e.g. 3"
            />
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

      <ProfileAppearancePanel />
      <ProfileBackupPanel />
      <ProfileSecurityPanel />

      <Button type="button" disabled={loading} onClick={() => void saveProfile()}>
        {loading ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}
