import type { AppFeatureId } from "./features";

export type AuthRole = "admin" | "user";

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
};

export type AuthGroup = {
  id: string;
  name: string;
  description?: string;
  blockedFeatures: AppFeatureId[];
  createdAt: number;
  updatedAt: number;
};

export type AuthUserPublic = Omit<AuthUser, "passwordHash">;

export type AuthSession = {
  userId: string;
  username: string;
  role: AuthRole;
  exp: number;
};

export type AuthSessionResponse = {
  authEnabled: boolean;
  user: AuthUserPublic | null;
  allowedFeatures: AppFeatureId[] | "all";
};

export type UsersDocument = {
  version: 1;
  users: AuthUser[];
};

export type GroupsDocument = {
  version: 1;
  groups: AuthGroup[];
};
