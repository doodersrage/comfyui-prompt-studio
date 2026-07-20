import { featureForPath, type AppFeatureId } from "./features";
import { readSessionFromRequest } from "./session";
import {
  findUserById,
  isAuthEnabled,
  userCanAccessFeature,
} from "./store";
import type { AuthUser } from "./types";

export function isPublicAuthPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return (
    path === "/login" ||
    path === "/forbidden" ||
    path === "/api/auth/login" ||
    path === "/api/auth/logout" ||
    path === "/api/auth/session" ||
    path === "/api/health"
  );
}

export function resolveRequestUser(request: Request): AuthUser | null {
  const session = readSessionFromRequest(request);
  if (!session) {
    return null;
  }
  return findUserById(session.userId);
}

export function authorizeAppRequest(request: Request): {
  ok: true;
  user: AuthUser | null;
  authEnabled: boolean;
} | {
  ok: false;
  status: number;
  error: string;
} {
  const authEnabled = isAuthEnabled();
  if (!authEnabled) {
    return { ok: true, user: null, authEnabled: false };
  }

  const pathname = new URL(request.url).pathname;
  if (isPublicAuthPath(pathname)) {
    return { ok: true, user: resolveRequestUser(request), authEnabled: true };
  }

  const user = resolveRequestUser(request);
  if (!user || !user.enabled) {
    return { ok: false, status: 401, error: "Sign in required." };
  }

  const feature = featureForPath(pathname);
  if (!userCanAccessFeature(user, feature)) {
    const label = feature ?? "resource";
    return { ok: false, status: 403, error: `Access to ${label} is blocked for your account.` };
  }

  return { ok: true, user, authEnabled: true };
}

export function canAccessFeature(
  allowed: AppFeatureId[] | "all" | null | undefined,
  feature: AppFeatureId,
): boolean {
  if (!allowed) {
    return true;
  }
  if (allowed === "all") {
    return true;
  }
  return allowed.includes(feature);
}

export function pathAllowedForFeatures(pathname: string, allowed: AppFeatureId[] | "all"): boolean {
  const feature = featureForPath(pathname);
  if (!feature) {
    return true;
  }
  return canAccessFeature(allowed, feature);
}
