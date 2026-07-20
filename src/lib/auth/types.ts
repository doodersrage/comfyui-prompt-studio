import type { AppFeatureId } from "./features";

export type AuthRole = "admin" | "user" | "viewer";

export type UserScheduledCampaign = {
  enabled: boolean;
  target: "random-scene" | "topics";
  count: number;
  intervalMin: number;
  autoQueueComfyUi: boolean;
  lastRunAt?: number;
};

export type AuthUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: AuthRole;
  groupIds: string[];
  blockedFeatures: AppFeatureId[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  comfyUiUrl?: string;
  quotaMaxPerMinute?: number;
  scheduledCampaign?: UserScheduledCampaign;
  exportEnabled?: boolean;
};

export type AuthGroup = {
  id: string;
  name: string;
  description?: string;
  blockedFeatures: AppFeatureId[];
  quotaMaxPerMinute?: number;
  createdAt: number;
  updatedAt: number;
};

export type AuthUserPublic = Omit<AuthUser, "passwordHash">;

export type AuthSession = {
  userId: string;
  username: string;
  role: AuthRole;
  exp: number;
  impersonatorId?: string;
};

export type AuthSessionResponse = {
  authEnabled: boolean;
  user: AuthUserPublic | null;
  allowedFeatures: AppFeatureId[] | "all";
  impersonating?: boolean;
  impersonatorUsername?: string;
};

export type UsersDocument = {
  version: 1;
  users: AuthUser[];
};

export type GroupsDocument = {
  version: 1;
  groups: AuthGroup[];
};

export const VIEWER_ALLOWED_FEATURES = [
  "dashboard",
  "gallery",
  "studio",
] as const satisfies readonly AppFeatureId[];
