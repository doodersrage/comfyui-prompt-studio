import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ALL_FEATURE_IDS, type AppFeatureId } from "./features";
import type { AuthGroup, AuthUser, AuthUserPublic, GroupsDocument, UsersDocument } from "./types";
import { VIEWER_ALLOWED_FEATURES } from "./types";
import {
  getDefaultAdminPassword,
  getDefaultAdminUsername,
  isAuthExplicitlyEnabled,
} from "./config";
import { hashPassword, verifyPassword } from "./password";

function authDir(): string {
  const base =
    process.env.PROMPT_AUTH_DIR?.trim() ||
    process.env.PROMPT_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".prompt-studio-data");
  const dir = path.join(base, "auth");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function usersPath(): string {
  return path.join(authDir(), "users.json");
}

function groupsPath(): string {
  return path.join(authDir(), "groups.json");
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile<T>(filePath: string, data: T): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

const AUTH_STORE_CACHE_MS = 2000;
let authStoreCache:
  | {
      users: UsersDocument;
      groups: GroupsDocument;
      loadedAt: number;
      authDir: string;
    }
  | null = null;

export function invalidateAuthStoreCache(): void {
  authStoreCache = null;
}

const DEFAULT_ADMIN_USER_ID = "user-admin-default";

function defaultUsersDocument(): UsersDocument {
  const now = Date.now();
  return {
    version: 1,
    users: [
      {
        id: DEFAULT_ADMIN_USER_ID,
        username: getDefaultAdminUsername(),
        passwordHash: hashPassword(getDefaultAdminPassword()),
        role: "admin",
        groupIds: [],
        blockedFeatures: [],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function defaultGroupsDocument(): GroupsDocument {
  return { version: 1, groups: [] };
}

function syncDefaultAdminFromEnv(users: UsersDocument): UsersDocument {
  if (!isAuthExplicitlyEnabled()) {
    return users;
  }

  const username = getDefaultAdminUsername();
  const password = getDefaultAdminPassword();
  const now = Date.now();

  let index = users.users.findIndex((user) => user.id === DEFAULT_ADMIN_USER_ID);
  if (index < 0) {
    index = users.users.findIndex(
      (user) =>
        user.role === "admin" &&
        user.username.trim().toLowerCase() === username.trim().toLowerCase(),
    );
  }

  if (index < 0) {
    const nextUsers = [
      {
        id: DEFAULT_ADMIN_USER_ID,
        username,
        passwordHash: hashPassword(password),
        role: "admin" as const,
        groupIds: [],
        blockedFeatures: [],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      ...users.users,
    ];
    saveUsers(nextUsers);
    return { version: 1, users: nextUsers };
  }

  const current = users.users[index];
  let changed = false;
  const next: AuthUser = { ...current };

  if (current.username !== username) {
    next.username = username;
    changed = true;
  }

  if (!verifyPassword(password, current.passwordHash)) {
    next.passwordHash = hashPassword(password);
    changed = true;
  }

  if (!changed) {
    return users;
  }

  next.updatedAt = now;
  const nextUsers = [...users.users];
  nextUsers[index] = next;
  saveUsers(nextUsers);
  return { version: 1, users: nextUsers };
}

export function ensureAuthStore(): { users: UsersDocument; groups: GroupsDocument } {
  const now = Date.now();
  const currentAuthDir = authDir();
  if (authStoreCache && authStoreCache.authDir !== currentAuthDir) {
    authStoreCache = null;
  }

  if (authStoreCache && now - authStoreCache.loadedAt < AUTH_STORE_CACHE_MS) {
    const { groups } = authStoreCache;
    const users = isAuthExplicitlyEnabled()
      ? syncDefaultAdminFromEnv(authStoreCache.users)
      : authStoreCache.users;
    authStoreCache = { users, groups, loadedAt: now, authDir: currentAuthDir };
    return { users, groups };
  }

  const usersFile = usersPath();
  const groupsFile = groupsPath();

  if (!fs.existsSync(usersFile)) {
    writeJsonFile(usersFile, defaultUsersDocument());
  }

  if (!fs.existsSync(groupsFile)) {
    writeJsonFile(groupsFile, defaultGroupsDocument());
  }

  const users = syncDefaultAdminFromEnv(
    readJsonFile<UsersDocument>(usersFile, defaultUsersDocument()),
  );
  const groups = readJsonFile<GroupsDocument>(groupsFile, defaultGroupsDocument());

  authStoreCache = { users, groups, loadedAt: now, authDir: currentAuthDir };
  return { users, groups };
}

export function isAuthEnabled(): boolean {
  if (isAuthExplicitlyEnabled()) {
    ensureAuthStore();
    return true;
  }

  return fs.existsSync(usersPath());
}

export function toPublicUser(user: AuthUser): AuthUserPublic {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export function listUsers(): AuthUserPublic[] {
  const { users } = ensureAuthStore();
  return users.users.map(toPublicUser);
}

export function listGroups(): AuthGroup[] {
  const { groups } = ensureAuthStore();
  return groups.groups;
}

export function findUserById(userId: string): AuthUser | null {
  const { users } = ensureAuthStore();
  return users.users.find((user) => user.id === userId) ?? null;
}

export function findUserByUsername(username: string): AuthUser | null {
  const normalized = username.trim().toLowerCase();
  const { users } = ensureAuthStore();
  return (
    users.users.find((user) => user.username.trim().toLowerCase() === normalized) ?? null
  );
}

export function verifyUserCredentials(username: string, password: string): AuthUser | null {
  const user = findUserByUsername(username);
  if (!user || !user.enabled) {
    return null;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }

  return user;
}

export function saveUsers(users: AuthUser[]): void {
  invalidateAuthStoreCache();
  writeJsonFile(usersPath(), { version: 1, users });
}

export function saveGroups(groups: AuthGroup[]): void {
  invalidateAuthStoreCache();
  writeJsonFile(groupsPath(), { version: 1, groups });
}

export function upsertUser(input: {
  id?: string;
  username: string;
  password?: string;
  role: AuthUser["role"];
  groupIds: string[];
  blockedFeatures: AppFeatureId[];
  enabled: boolean;
  comfyUiUrl?: string;
  quotaMaxPerMinute?: number;
  scheduledCampaign?: AuthUser["scheduledCampaign"];
  exportEnabled?: boolean;
  email?: string;
  emailNotifyBatch?: boolean;
  emailNotifySecurity?: boolean;
}): AuthUserPublic {
  const { users } = ensureAuthStore();
  const now = Date.now();
  const existingIndex = input.id
    ? users.users.findIndex((user) => user.id === input.id)
    : users.users.findIndex(
        (user) => user.username.trim().toLowerCase() === input.username.trim().toLowerCase(),
      );

  const existing = existingIndex >= 0 ? users.users[existingIndex] : null;
  const next: AuthUser = {
    id: input.id ?? randomUUID(),
    username: input.username.trim(),
    passwordHash:
      existing?.passwordHash ?? hashPassword(input.password || randomUUID()),
    role: input.role,
    groupIds: input.groupIds,
    blockedFeatures: input.blockedFeatures,
    enabled: input.enabled,
    comfyUiUrl: input.comfyUiUrl?.trim() || undefined,
    quotaMaxPerMinute:
      input.quotaMaxPerMinute && input.quotaMaxPerMinute > 0
        ? Math.floor(input.quotaMaxPerMinute)
        : undefined,
    scheduledCampaign: input.scheduledCampaign ?? existing?.scheduledCampaign,
    exportEnabled: input.exportEnabled ?? existing?.exportEnabled,
    email: input.email?.trim() || existing?.email,
    emailNotifyBatch: input.emailNotifyBatch ?? existing?.emailNotifyBatch,
    emailNotifySecurity: input.emailNotifySecurity ?? existing?.emailNotifySecurity,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (input.password?.trim()) {
    next.passwordHash = hashPassword(input.password.trim());
  }

  const adminCount = users.users.filter((user) => user.role === "admin" && user.enabled).length;
  if (
    existingIndex >= 0 &&
    users.users[existingIndex].role === "admin" &&
    next.role !== "admin" &&
    adminCount <= 1
  ) {
    throw new Error("Cannot demote the last enabled admin.");
  }

  if (existingIndex >= 0) {
    users.users[existingIndex] = next;
  } else {
    if (!input.password?.trim()) {
      throw new Error("Password is required for new users.");
    }
    users.users.unshift(next);
  }

  saveUsers(users.users);
  return toPublicUser(next);
}

export function deleteUser(userId: string): void {
  const { users } = ensureAuthStore();
  const target = users.users.find((user) => user.id === userId);
  if (!target) {
    throw new Error("User not found.");
  }

  const enabledAdmins = users.users.filter((user) => user.role === "admin" && user.enabled);
  if (target.role === "admin" && target.enabled && enabledAdmins.length <= 1) {
    throw new Error("Cannot delete the last enabled admin.");
  }

  saveUsers(users.users.filter((user) => user.id !== userId));
}

export function upsertGroup(input: {
  id?: string;
  name: string;
  description?: string;
  blockedFeatures: AppFeatureId[];
  quotaMaxPerMinute?: number;
}): AuthGroup {
  const { groups } = ensureAuthStore();
  const now = Date.now();
  const existingIndex = input.id
    ? groups.groups.findIndex((group) => group.id === input.id)
    : groups.groups.findIndex(
        (group) => group.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
      );

  const next: AuthGroup = {
    id: input.id ?? randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    blockedFeatures: input.blockedFeatures,
    quotaMaxPerMinute:
      input.quotaMaxPerMinute && input.quotaMaxPerMinute > 0
        ? Math.floor(input.quotaMaxPerMinute)
        : undefined,
    createdAt: existingIndex >= 0 ? groups.groups[existingIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    groups.groups[existingIndex] = next;
  } else {
    groups.groups.unshift(next);
  }

  saveGroups(groups.groups);
  return next;
}

export function deleteGroup(groupId: string): void {
  const { users, groups } = ensureAuthStore();
  saveGroups(groups.groups.filter((group) => group.id !== groupId));

  saveUsers(
    users.users.map((user) => ({
      ...user,
      groupIds: user.groupIds.filter((id) => id !== groupId),
      updatedAt: Date.now(),
    })),
  );
}

export function resolveBlockedFeatures(user: AuthUser): Set<AppFeatureId> {
  if (user.role === "admin") {
    return new Set();
  }

  if (user.role === "viewer") {
    const allowed = new Set<AppFeatureId>(VIEWER_ALLOWED_FEATURES);
    return new Set(ALL_FEATURE_IDS.filter((feature) => !allowed.has(feature)));
  }

  const { groups } = ensureAuthStore();
  const blocked = new Set<AppFeatureId>(user.blockedFeatures);

  for (const groupId of user.groupIds) {
    const group = groups.groups.find((entry) => entry.id === groupId);
    if (!group) {
      continue;
    }
    for (const feature of group.blockedFeatures) {
      blocked.add(feature);
    }
  }

  return blocked;
}

export function listAllowedFeatures(user: AuthUser | null): AppFeatureId[] | "all" {
  if (!user) {
    return [];
  }
  if (user.role === "admin") {
    return "all";
  }
  if (user.role === "viewer") {
    return [...VIEWER_ALLOWED_FEATURES];
  }

  const blocked = resolveBlockedFeatures(user);
  return ALL_FEATURE_IDS.filter((feature) => !blocked.has(feature));
}

export function updateUserProfile(
  userId: string,
  input: {
    password?: string;
    currentPassword?: string;
    comfyUiUrl?: string;
    scheduledCampaign?: AuthUser["scheduledCampaign"];
    exportEnabled?: boolean;
    totpSecret?: string;
    totpEnabled?: boolean;
    email?: string;
    emailNotifyBatch?: boolean;
    emailNotifySecurity?: boolean;
  },
): AuthUserPublic {
  const { users } = ensureAuthStore();
  const index = users.users.findIndex((user) => user.id === userId);
  if (index < 0) {
    throw new Error("User not found.");
  }

  const current = users.users[index];
  const next: AuthUser = { ...current, updatedAt: Date.now() };

  if (input.password?.trim()) {
    if (input.currentPassword && !verifyPassword(input.currentPassword, current.passwordHash)) {
      throw new Error("Current password is incorrect.");
    }
    next.passwordHash = hashPassword(input.password.trim());
  }

  if (input.comfyUiUrl !== undefined) {
    next.comfyUiUrl = input.comfyUiUrl.trim() || undefined;
  }
  if (input.scheduledCampaign !== undefined) {
    next.scheduledCampaign = input.scheduledCampaign;
  }
  if (input.exportEnabled !== undefined) {
    next.exportEnabled = input.exportEnabled;
  }
  if (input.totpSecret !== undefined) {
    next.totpSecret = input.totpSecret || undefined;
  }
  if (input.totpEnabled !== undefined) {
    next.totpEnabled = input.totpEnabled;
  }
  if (input.email !== undefined) {
    next.email = input.email.trim() || undefined;
  }
  if (input.emailNotifyBatch !== undefined) {
    next.emailNotifyBatch = input.emailNotifyBatch;
  }
  if (input.emailNotifySecurity !== undefined) {
    next.emailNotifySecurity = input.emailNotifySecurity;
  }

  users.users[index] = next;
  saveUsers(users.users);
  return toPublicUser(next);
}

export function listUsersWithCampaigns(): AuthUser[] {
  const { users } = ensureAuthStore();
  return users.users.filter((user) => user.enabled && user.scheduledCampaign?.enabled);
}

export function userCanAccessFeature(user: AuthUser | null, feature: AppFeatureId | null): boolean {
  if (!feature) {
    return true;
  }
  if (!user || !user.enabled) {
    return false;
  }
  if (feature === "profile") {
    return true;
  }
  if (user.role === "admin") {
    return true;
  }
  return !resolveBlockedFeatures(user).has(feature);
}

export function getAuthBootstrapInfo(): { enabled: boolean; defaultAdminUsername: string } {
  return {
    enabled: isAuthEnabled(),
    defaultAdminUsername: getDefaultAdminUsername(),
  };
}
