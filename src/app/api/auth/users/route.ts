import { apiError, apiJson } from "@/lib/api/response";
import { readSessionFromRequest } from "@/lib/auth/session";
import { appendAuditLog } from "@/lib/auth/audit-log";
import type { AppFeatureId } from "@/lib/auth/features";
import {
  deleteUser,
  findUserById,
  isAuthEnabled,
  listUsers,
  upsertUser,
} from "@/lib/auth/store";
import type { UserScheduledCampaign } from "@/lib/auth/types";
import { notifyPasswordChanged } from "@/lib/email/notifications";

export const runtime = "nodejs";

function requireAdmin(request: Request) {
  if (!isAuthEnabled()) {
    return apiError("Authentication is disabled.", 400);
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user || user.role !== "admin" || !user.enabled) {
    return apiError("Admin access required.", 403);
  }

  return { user };
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied instanceof Response) {
    return denied;
  }

  return apiJson({ users: listUsers() });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) {
    return admin;
  }

  let body: {
    id?: string;
    username?: string;
    password?: string;
    role?: "admin" | "user" | "viewer";
    groupIds?: string[];
    blockedFeatures?: AppFeatureId[];
    enabled?: boolean;
    comfyUiUrl?: string;
    quotaMaxPerMinute?: number;
    scheduledCampaign?: UserScheduledCampaign;
    exportEnabled?: boolean;
    email?: string;
    emailNotifyBatch?: boolean;
    emailNotifySecurity?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  if (!body.username?.trim()) {
    return apiError("Username is required.", 400);
  }

  try {
    const user = upsertUser({
      id: body.id,
      username: body.username,
      password: body.password,
      role:
        body.role === "admin" ? "admin" : body.role === "viewer" ? "viewer" : "user",
      groupIds: body.groupIds ?? [],
      blockedFeatures: body.blockedFeatures ?? [],
      enabled: body.enabled ?? true,
      comfyUiUrl: body.comfyUiUrl,
      quotaMaxPerMinute: body.quotaMaxPerMinute,
      scheduledCampaign: body.scheduledCampaign,
      exportEnabled: body.exportEnabled,
      email: body.email,
      emailNotifyBatch: body.emailNotifyBatch,
      emailNotifySecurity: body.emailNotifySecurity,
    });
    const passwordChanged = Boolean(body.password?.trim());
    appendAuditLog({
      actorUserId: admin.user.id,
      actorUsername: admin.user.username,
      action: body.id ? "user.updated" : "user.created",
      target: user.id,
      details: user.username,
    });
    if (passwordChanged) {
      appendAuditLog({
        actorUserId: admin.user.id,
        actorUsername: admin.user.username,
        action: "password.changed",
        target: user.id,
        details: "admin reset",
      });
      void notifyPasswordChanged({
        userId: user.id,
        username: user.username,
        changedBy: "admin",
        adminUsername: admin.user.username,
      });
    }
    return apiJson({ user });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to save user.", 400);
  }
}

export async function DELETE(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) {
    return admin;
  }

  const userId = new URL(request.url).searchParams.get("id")?.trim();
  if (!userId) {
    return apiError("User id is required.", 400);
  }

  try {
    deleteUser(userId);
    appendAuditLog({
      actorUserId: admin.user.id,
      actorUsername: admin.user.username,
      action: "user.deleted",
      target: userId,
    });
    return apiJson({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to delete user.", 400);
  }
}
