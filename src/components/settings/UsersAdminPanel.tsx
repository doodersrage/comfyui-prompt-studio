"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_FEATURES, ALL_FEATURE_IDS, type AppFeatureId } from "@/lib/auth/features";
import type { AuthGroup, AuthUserPublic } from "@/lib/auth/types";
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
  const [status, setStatus] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    role: "user" as "admin" | "user",
    groupIds: [] as string[],
    blockedFeatures: [] as AppFeatureId[],
    enabled: true,
  });

  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    blockedFeatures: [] as AppFeatureId[],
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
    const [usersResponse, groupsResponse, analyticsResponse] = await Promise.all([
      fetch("/api/auth/users"),
      fetch("/api/auth/groups"),
      fetch("/api/auth/analytics"),
    ]);
    const usersData = (await usersResponse.json()) as { users?: AuthUserPublic[]; error?: string };
    const groupsData = (await groupsResponse.json()) as { groups?: AuthGroup[]; error?: string };
    const analyticsData = (await analyticsResponse.json()) as {
      snapshots?: UserAnalyticsSnapshot[];
      error?: string;
    };
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
    } else {
      setAnalyticsSnapshots([]);
    }
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
    });
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedGroup) {
      setGroupForm({ name: "", description: "", blockedFeatures: [] });
      return;
    }
    setGroupForm({
      name: selectedGroup.name,
      description: selectedGroup.description ?? "",
      blockedFeatures: selectedGroup.blockedFeatures,
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

      <ToolSection title="User analytics">
        <p className="mb-4 text-sm text-zinc-400">
          Last synced snapshots from each user&apos;s browser (Studio history + gallery). Users
          sync automatically after they generate, rate, or sign in.
        </p>
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
              <label className="space-y-2 text-sm">
                <span className="type-caption text-zinc-500">Role</span>
                <select
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm((prev) => ({
                      ...prev,
                      role: event.target.value as "admin" | "user",
                    }))
                  }
                  className="ui-input w-full"
                >
                  <option value="user">User</option>
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
                <Button type="button" variant="ghost" onClick={() => void deleteUser(selectedUser.id)}>
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </ToolSection>
    </div>
  );
}
