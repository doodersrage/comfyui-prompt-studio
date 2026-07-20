import { apiError, apiJson } from "@/lib/api/response";
import { readSessionFromRequest } from "@/lib/auth/session";
import { appendAuditLog } from "@/lib/auth/audit-log";
import {
  findUserById,
  isAuthEnabled,
  listAllowedFeatures,
  toPublicUser,
  updateUserProfile,
} from "@/lib/auth/store";
import type { UserScheduledCampaign } from "@/lib/auth/types";

export const runtime = "nodejs";

function resolveUser(request: Request) {
  if (!isAuthEnabled()) {
    return { error: apiError("Authentication is disabled.", 400) };
  }
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user || !user.enabled) {
    return { error: apiError("Sign in required.", 401) };
  }
  return { user, session };
}

export async function GET(request: Request) {
  const resolved = resolveUser(request);
  if ("error" in resolved) {
    return resolved.error;
  }

  const { user, session } = resolved;
  const impersonator = session?.impersonatorId
    ? findUserById(session.impersonatorId)
    : null;

  return apiJson({
    user: toPublicUser(user),
    allowedFeatures: listAllowedFeatures(user),
    impersonating: Boolean(session?.impersonatorId),
    impersonatorUsername: impersonator?.username,
  });
}

export async function PATCH(request: Request) {
  const resolved = resolveUser(request);
  if ("error" in resolved) {
    return resolved.error;
  }

  let body: {
    currentPassword?: string;
    password?: string;
    comfyUiUrl?: string;
    scheduledCampaign?: UserScheduledCampaign;
    exportEnabled?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  try {
    const user = updateUserProfile(resolved.user.id, body);
    if (body.password?.trim()) {
      appendAuditLog({
        actorUserId: resolved.user.id,
        actorUsername: resolved.user.username,
        action: "password.changed",
        target: resolved.user.id,
      });
    }
    return apiJson({ user });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Profile update failed.", 400);
  }
}
