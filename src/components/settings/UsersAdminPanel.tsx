"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_FEATURES, ALL_FEATURE_IDS, type AppFeatureId } from "@/lib/auth/features";
import type { AuthGroup, AuthUserPublic } from "@/lib/auth/types";
import type { AuditLogEntry } from "@/lib/auth/audit-log";
import type { SharedPresetEntry } from "@/lib/shared-preset-store";
import type { SharedProject } from "@/lib/shared-projects-store";
import type { UserAnalyticsSnapshot } from "@/lib/user-analytics";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { ToolSection } from "@/components/ui/ToolPageShell";

function FeaturePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: AppFeatureId[];
  onChange: (next: AppFeatureId[]) => void;
  disabled?: boolean;
}) {
  const blockedSet = useMemo(() => new Set(value), [value]);
  const allowedCount = ALL_FEATURE_IDS.length - value.length;
  const allAllowed = value.length === 0;
  const allBlocked = value.length === ALL_FEATURE_IDS.length;

  function setBlocked(nextBlocked: AppFeatureId[]) {
    onChange([...new Set(nextBlocked)]);
  }

  function toggleAllowed(featureId: AppFeatureId) {
    if (blockedSet.has(featureId)) {
      setBlocked(value.filter((entry) => entry !== featureId));
      return;
    }
    setBlocked([...value, featureId]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || allAllowed}
          onClick={() => setBlocked([])}
          className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100 transition hover:border-emerald-400/50 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Allow all
        </button>
        <button
          type="button"
          disabled={disabled || allBlocked}
          onClick={() => setBlocked([...ALL_FEATURE_IDS])}
          className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Block all
        </button>
        <span className="type-caption text-zinc-500">
          {allowedCount} of {ALL_FEATURE_IDS.length} sections allowed
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {APP_FEATURES.map((feature) => {
          const allowed = !blockedSet.has(feature.id);
          return (
            <label
              key={feature.id}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                disabled
                  ? "cursor-not-allowed border-zinc-800/50 bg-zinc-950/20 opacity-60"
                  : allowed
                    ? "border-violet-500/25 bg-violet-500/5 text-zinc-200"
                    : "border-zinc-800/80 bg-zinc-950/40 text-zinc-400"
              }`}
            >
              <input
                type="checkbox"
                checked={allowed}
                disabled={disabled}
                onChange={() => toggleAllowed(feature.id)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
              />
              <span>
                <span className="block font-medium text-zinc-100">{feature.label}</span>
                <span className="block text-xs text-zinc-500">{feature.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function UsersAdminPanel() {
  const [users, setUsers] = useState<AuthUserPublic[]>([]);
  const [groups, setGroups] = useState<AuthGroup[]>([]);
  const [analyticsSnapshots, setAnalyticsSnapshots] = useState<UserAnalyticsSnapshot[]>([]);
  const [analyticsHistory, setAnalyticsHistory] = useState<
    Record<string, UserAnalyticsSnapshot[]>
  >({});
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [sharedPresets, setSharedPresets] = useState<SharedPresetEntry[]>([]);
  const [sharedPresetDraft, setSharedPresetDraft] = useState({
    label: "",
    hints: "",
    category: "",
  });
  const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([]);
  const [sharedProjectDraft, setSharedProjectDraft] = useState({
    name: "",
    notes: "",
    groupIds: [] as string[],
  });
  const [status, setStatus] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    role: "user" as "admin" | "user" | "viewer",
    groupIds: [] as string[],
    blockedFeatures: [] as AppFeatureId[],
    enabled: true,
    quotaMaxPerMinute: "",
    exportEnabled: false,
    email: "",
    emailNotifyBatch: true,
    emailNotifySecurity: true,
  });

  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    blockedFeatures: [] as AppFeatureId[],
    quotaMaxPerMinute: "",
  });

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [selectedGroupId, groups],
  );

  const selectedUserAnalytics = useMemo(
    () => analyticsSnapshots.find((snapshot) => snapshot.userId === selectedUserId) ?? null,
    [analyticsSnapshots, selectedUserId],
  );

  function formatCapturedAt(timestamp: number): string {
    if (!timestamp) {
      return "Never synced";
    }
    return new Date(timestamp).toLocaleString();
  }

  const refresh = useCallback(async () => {
    const [usersResponse, groupsResponse, analyticsResponse, auditResponse, presetsResponse, projectsResponse] =
      await Promise.all([
      fetch("/api/auth/users"),
      fetch("/api/auth/groups"),
      fetch("/api/auth/analytics"),
      fetch("/api/auth/audit"),
      fetch("/api/shared-presets"),
      fetch("/api/shared-projects"),
    ]);
    const usersData = (await usersResponse.json()) as { users?: AuthUserPublic[]; error?: string };
    const groupsData = (await groupsResponse.json()) as { groups?: AuthGroup[]; error?: string };
    const analyticsData = (await analyticsResponse.json()) as {
      snapshots?: UserAnalyticsSnapshot[];
      history?: Record<string, UserAnalyticsSnapshot[]>;
      error?: string;
    };
    const auditData = (await auditResponse.json()) as { entries?: AuditLogEntry[] };
    const presetsData = (await presetsResponse.json()) as { presets?: SharedPresetEntry[] };
    const projectsData = (await projectsResponse.json()) as { projects?: SharedProject[] };
    if (!usersResponse.ok) {
      throw new Error(usersData.error ?? "Failed to load users.");
    }
    if (!groupsResponse.ok) {
      throw new Error(groupsData.error ?? "Failed to load groups.");
    }
    setUsers(usersData.users ?? []);
    setGroups(groupsData.groups ?? []);
    if (analyticsResponse.ok) {
      setAnalyticsSnapshots(analyticsData.snapshots ?? []);
      setAnalyticsHistory(analyticsData.history ?? {});
    } else {
      setAnalyticsSnapshots([]);
      setAnalyticsHistory({});
    }
    setAuditEntries(auditResponse.ok ? auditData.entries ?? [] : []);
    setSharedPresets(presetsData.presets ?? []);
    setSharedProjects(projectsData.projects ?? []);
  }, []);

  useEffect(() => {
    void refresh().catch((error) => {
      setStatus(error instanceof Error ? error.message : "Failed to load auth data.");
    });
  }, [refresh]);

  useEffect(() => {
    if (!selectedUser) {
      setUserForm({
        username: "",
        password: "",
        role: "user",
        groupIds: [],
        blockedFeatures: [],
        enabled: true,
        quotaMaxPerMinute: "",
        exportEnabled: false,
        email: "",
        emailNotifyBatch: true,
        emailNotifySecurity: true,
      });
      return;
    }
    setUserForm({
      username: selectedUser.username,
      password: "",
      role: selectedUser.role,
      groupIds: selectedUser.groupIds,
      blockedFeatures: selectedUser.blockedFeatures,
      enabled: selectedUser.enabled,
      quotaMaxPerMinute: selectedUser.quotaMaxPerMinute
        ? String(selectedUser.quotaMaxPerMinute)
        : "",
      exportEnabled: Boolean(selectedUser.exportEnabled),
      email: selectedUser.email ?? "",
      emailNotifyBatch: selectedUser.emailNotifyBatch !== false,
      emailNotifySecurity: selectedUser.emailNotifySecurity !== false,
    });
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedGroup) {
      setGroupForm({ name: "", description: "", blockedFeatures: [], quotaMaxPerMinute: "" });
      return;
    }
    setGroupForm({
      name: selectedGroup.name,
      description: selectedGroup.description ?? "",
      blockedFeatures: selectedGroup.blockedFeatures,
      quotaMaxPerMinute: selectedGroup.quotaMaxPerMinute
        ? String(selectedGroup.quotaMaxPerMinute)
        : "",
    });
  }, [selectedGroup]);

  async function saveUser() {
    setStatus(null);
    const response = await fetch("/api/auth/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedUser?.id,
        ...userForm,
        quotaMaxPerMinute: userForm.quotaMaxPerMinute
          ? Number(userForm.quotaMaxPerMinute)
          : undefined,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus(data.error ?? "Failed to save user.");
      return;
    }
    setStatus("User saved.");
    setSelectedUserId(null);
    await refresh();
  }

  async function saveGroup() {
    setStatus(null);
    const response = await fetch("/api/auth/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedGroup?.id,
        ...groupForm,
        quotaMaxPerMinute: groupForm.quotaMaxPerMinute
          ? Number(groupForm.quotaMaxPerMinute)
          : undefined,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus(data.error ?? "Failed to save group.");
      return;
    }
    setStatus("Group saved.");
    setSelectedGroupId(null);
    await refresh();
  }

  async function deleteUser(id: string) {
    if (!window.confirm("Delete this user?")) {
      return;
    }
    const response = await fetch(`/api/auth/users?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus(data.error ?? "Failed to delete user.");
      return;
    }
    setStatus("User deleted.");
    setSelectedUserId(null);
    await refresh();
  }

  async function deleteGroup(id: string) {
    if (!window.confirm("Delete this group?")) {
      return;
    }
    const response = await fetch(`/api/auth/groups?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus(data.error ?? "Failed to delete group.");
      return;
    }
    setStatus("Group deleted.");
    setSelectedGroupId(null);
    await refresh();
  }

  return (
    <div className="space-y-8">
      {status ? (
        <p className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-sm text-violet-100">
          {status}
        </p>
      ) : null}

      <ToolSection title="Groups">
        <p className="mb-4 text-sm text-zinc-400">
          Block features for everyone in a group. User-specific blocks stack on top of group blocks.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setSelectedGroupId(group.id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                selectedGroupId === group.id
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-100"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {group.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedGroupId("__new__")}
            className="rounded-full border border-dashed border-zinc-700 px-3 py-1 text-xs text-zinc-400"
          >
            + New group
          </button>
        </div>

        {selectedGroupId ? (
          <div className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="type-caption text-zinc-500">Name</span>
                <TextInput
                  value={groupForm.name}
                  onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="type-caption text-zinc-500">Description</span>
                <TextInput
                  value={groupForm.description}
                  onChange={(event) =>
                    setGroupForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="type-caption text-zinc-500">Quota (req/min)</span>
                <TextInput
                  type="number"
                  value={groupForm.quotaMaxPerMinute}
                  onChange={(event) =>
                    setGroupForm((prev) => ({ ...prev, quotaMaxPerMinute: event.target.value }))
                  }
                  placeholder="Default"
                />
              </label>
            </div>
            <div className="space-y-2">
              <p className="type-caption text-zinc-500">Blocked features for this group</p>
              <FeaturePicker
                value={groupForm.blockedFeatures}
                onChange={(blockedFeatures) => setGroupForm((prev) => ({ ...prev, blockedFeatures }))}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveGroup()}>
                Save group
              </Button>
              {selectedGroup ? (
                <Button type="button" variant="ghost" onClick={() => void deleteGroup(selectedGroup.id)}>
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </ToolSection>

      <ToolSection title="Quota overview">
        <p className="mb-4 text-sm text-zinc-400">
          Per-user API rate limits from user and group settings. Global defaults use{" "}
          <code className="text-zinc-300">API_RATE_LIMIT_MAX</code> when unset.
        </p>
        {users.length === 0 ? (
          <p className="text-sm text-zinc-500">No users loaded.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800/80">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-800/80 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">User quota</th>
                  <th className="px-3 py-2 font-medium">Group quotas</th>
                  <th className="px-3 py-2 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => {
                  const groupQuotas = entry.groupIds
                    .map((groupId) => groups.find((group) => group.id === groupId))
                    .filter(Boolean)
                    .map((group) =>
                      group!.quotaMaxPerMinute
                        ? `${group!.name}: ${group!.quotaMaxPerMinute}/min`
                        : group!.name,
                    );
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-zinc-800/50 transition hover:bg-zinc-900/40"
                    >
                      <td className="px-3 py-2 text-zinc-200">{entry.username}</td>
                      <td className="px-3 py-2 text-zinc-400">{entry.role}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-400">
                        {entry.quotaMaxPerMinute ? `${entry.quotaMaxPerMinute}/min` : "Default"}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {groupQuotas.length > 0 ? groupQuotas.join(" · ") : "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{entry.enabled ? "Yes" : "No"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ToolSection>

      <ToolSection title="User analytics">
        {analyticsSnapshots.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No analytics synced yet. Users need to sign in and use Studio or Gallery on their
            device.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800/80">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-800/80 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">History</th>
                  <th className="px-3 py-2 font-medium">Gallery</th>
                  <th className="px-3 py-2 font-medium">Rated</th>
                  <th className="px-3 py-2 font-medium">Favorites</th>
                  <th className="px-3 py-2 font-medium">Last sync</th>
                </tr>
              </thead>
              <tbody>
                {analyticsSnapshots.map((snapshot) => (
                  <tr
                    key={snapshot.userId}
                    className={`border-b border-zinc-800/50 transition hover:bg-zinc-900/40 ${
                      selectedUserId === snapshot.userId ? "bg-violet-500/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-zinc-200">{snapshot.username}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-400">{snapshot.historyTotal}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-400">{snapshot.galleryTotal}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-400">
                      {snapshot.historyRated + snapshot.galleryRated}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-400">
                      {snapshot.historyFavorites + snapshot.galleryFavorites}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {formatCapturedAt(snapshot.capturedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedUserAnalytics ? (
          <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 text-sm text-zinc-300">
            <p className="font-medium text-violet-100">{selectedUserAnalytics.username}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Synced {formatCapturedAt(selectedUserAnalytics.capturedAt)}
            </p>
            {(analyticsHistory[selectedUserAnalytics.userId] ?? []).length > 1 ? (
              <div className="mt-4 flex h-16 items-end gap-1">
                {[...(analyticsHistory[selectedUserAnalytics.userId] ?? [])]
                  .slice(0, 20)
                  .reverse()
                  .map((point) => {
                    const max = Math.max(
                      ...(analyticsHistory[selectedUserAnalytics.userId] ?? []).map(
                        (entry) => entry.historyTotal,
                      ),
                      1,
                    );
                    const height = Math.max(8, Math.round((point.historyTotal / max) * 100));
                    return (
                      <div
                        key={point.capturedAt}
                        title={`${point.historyTotal} history · ${new Date(point.capturedAt).toLocaleDateString()}`}
                        className="flex-1 rounded-t bg-violet-500/40"
                        style={{ height: `${height}%` }}
                      />
                    );
                  })}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedUserAnalytics.topPositiveTokens.slice(0, 5).map((token) => (
                <span
                  key={`pos-${token}`}
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200"
                >
                  + {token}
                </span>
              ))}
              {selectedUserAnalytics.topNegativeTokens.slice(0, 5).map((token) => (
                <span
                  key={`neg-${token}`}
                  className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200"
                >
                  − {token}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </ToolSection>

      <ToolSection title="Shared preset library">
        <p className="mb-3 text-sm text-zinc-400">
          Publish read-only scene hints for all users. They appear on Profile and can be copied.
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <TextInput
            value={sharedPresetDraft.label}
            onChange={(event) =>
              setSharedPresetDraft((prev) => ({ ...prev, label: event.target.value }))
            }
            placeholder="Preset label"
          />
          <TextInput
            value={sharedPresetDraft.hints}
            onChange={(event) =>
              setSharedPresetDraft((prev) => ({ ...prev, hints: event.target.value }))
            }
            placeholder="Hints text"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mb-4"
          onClick={() => {
            void fetch("/api/shared-presets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sharedPresetDraft),
            }).then(() => {
              setSharedPresetDraft({ label: "", hints: "", category: "" });
              void refresh();
            });
          }}
        >
          Publish preset
        </Button>
        <ul className="space-y-2">
          {sharedPresets.map((preset) => (
            <li
              key={preset.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-zinc-100">{preset.label}</p>
                <p className="text-xs text-zinc-500">{preset.hints}</p>
              </div>
              <button
                type="button"
                className="text-xs text-rose-300"
                onClick={() => {
                  void fetch(`/api/shared-presets?id=${encodeURIComponent(preset.id)}`, {
                    method: "DELETE",
                  }).then(() => void refresh());
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </ToolSection>

      <ToolSection title="Shared projects">
        <p className="mb-3 text-sm text-zinc-400">
          Assign group-scoped campaign projects. Members see these in Studio → Projects.
        </p>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <TextInput
            value={sharedProjectDraft.name}
            onChange={(event) =>
              setSharedProjectDraft((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="Project name"
          />
          <TextInput
            value={sharedProjectDraft.notes}
            onChange={(event) =>
              setSharedProjectDraft((prev) => ({ ...prev, notes: event.target.value }))
            }
            placeholder="Notes (optional)"
          />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {groups.map((group) => {
            const active = sharedProjectDraft.groupIds.includes(group.id);
            return (
              <button
                key={group.id}
                type="button"
                onClick={() =>
                  setSharedProjectDraft((prev) => ({
                    ...prev,
                    groupIds: active
                      ? prev.groupIds.filter((id) => id !== group.id)
                      : [...prev.groupIds, group.id],
                  }))
                }
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-violet-500/40 bg-violet-500/15 text-violet-100"
                    : "border-zinc-700/80 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                {group.name}
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mb-4"
          disabled={!sharedProjectDraft.name.trim()}
          onClick={() => {
            void fetch("/api/shared-projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sharedProjectDraft),
            }).then(() => {
              setSharedProjectDraft({ name: "", notes: "", groupIds: [] });
              void refresh();
            });
          }}
        >
          Publish project
        </Button>
        <ul className="space-y-2">
          {sharedProjects.map((project) => (
            <li
              key={project.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-zinc-100">{project.name}</p>
                {project.notes ? <p className="text-xs text-zinc-500">{project.notes}</p> : null}
                <p className="mt-1 text-[10px] text-zinc-600">
                  Groups:{" "}
                  {project.groupIds.length > 0
                    ? project.groupIds
                        .map((groupId) => groups.find((group) => group.id === groupId)?.name ?? groupId)
                        .join(", ")
                    : "all (none selected)"}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-rose-300"
                onClick={() => {
                  void fetch("/api/shared-projects", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: project.id }),
                  }).then(() => void refresh());
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </ToolSection>

      <ToolSection title="Audit log">
        {auditEntries.length === 0 ? (
          <p className="text-sm text-zinc-500">No admin actions logged yet.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {auditEntries.slice(0, 40).map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-zinc-300"
              >
                <span className="text-zinc-500">{new Date(entry.at).toLocaleString()}</span>
                {" · "}
                <span className="text-zinc-100">{entry.actorUsername}</span>
                {" · "}
                {entry.action}
                {entry.details ? ` · ${entry.details}` : ""}
              </li>
            ))}
          </ul>
        )}
      </ToolSection>

      <ToolSection title="Users">
        <div className="mb-4 flex flex-wrap gap-2">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => setSelectedUserId(user.id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                selectedUserId === user.id
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-100"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {user.username}
              {user.role === "admin" ? " · admin" : ""}
              {!user.enabled ? " · disabled" : ""}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedUserId("__new__")}
            className="rounded-full border border-dashed border-zinc-700 px-3 py-1 text-xs text-zinc-400"
          >
            + New user
          </button>
        </div>

        {selectedUserId ? (
          <div className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="type-caption text-zinc-500">Username</span>
                <TextInput
                  value={userForm.username}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, username: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="type-caption text-zinc-500">
                  Password {selectedUser ? "(leave blank to keep current)" : ""}
                </span>
                <TextInput
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm sm:col-span-2">
                <span className="type-caption text-zinc-500">Email</span>
                <TextInput
                  type="email"
                  value={userForm.email}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Optional notification address"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={userForm.emailNotifyBatch}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, emailNotifyBatch: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
                />
                Email on batch completion
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={userForm.emailNotifySecurity}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, emailNotifySecurity: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
                />
                Email on password change
              </label>
              <label className="space-y-2 text-sm">
                <span className="type-caption text-zinc-500">Role</span>
                <select
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm((prev) => ({
                      ...prev,
                      role: event.target.value as "admin" | "user" | "viewer",
                    }))
                  }
                  className="ui-input w-full"
                >
                  <option value="user">User</option>
                  <option value="viewer">Viewer (read-only)</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={userForm.enabled}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
                />
                Account enabled
              </label>
              <label className="space-y-2 text-sm">
                <span className="type-caption text-zinc-500">API quota (req/min)</span>
                <TextInput
                  type="number"
                  value={userForm.quotaMaxPerMinute}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, quotaMaxPerMinute: event.target.value }))
                  }
                  placeholder="Inherit default / group"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={userForm.exportEnabled}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, exportEnabled: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
                />
                Nightly server export
              </label>
            </div>

            {groups.length > 0 ? (
              <div className="space-y-2">
                <p className="type-caption text-zinc-500">Groups</p>
                <div className="flex flex-wrap gap-2">
                  {groups.map((group) => {
                    const checked = userForm.groupIds.includes(group.id);
                    return (
                      <label
                        key={group.id}
                        className="flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setUserForm((prev) => ({
                              ...prev,
                              groupIds: checked
                                ? prev.groupIds.filter((id) => id !== group.id)
                                : [...prev.groupIds, group.id],
                            }))
                          }
                          className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
                        />
                        {group.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {userForm.role === "admin" ? (
              <p className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-sm text-violet-100">
                Admin accounts always have access to every section. Feature blocks apply only to
                regular users.
              </p>
            ) : userForm.role === "viewer" ? (
              <p className="rounded-xl border border-zinc-700/80 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-400">
                Viewers can browse Dashboard, Gallery, and Studio only.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="type-caption text-zinc-500">Section access</p>
                <FeaturePicker
                  value={userForm.blockedFeatures}
                  onChange={(blockedFeatures) =>
                    setUserForm((prev) => ({ ...prev, blockedFeatures }))
                  }
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveUser()}>
                Save user
              </Button>
              {selectedUser && selectedUser.role !== "admin" ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void fetch("/api/auth/impersonate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: selectedUser.id }),
                      }).then(() => {
                        window.location.href = "/";
                      });
                    }}
                  >
                    Impersonate
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void deleteUser(selectedUser.id)}>
                    Delete
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </ToolSection>
    </div>
  );
}
