import { apiError, apiJson } from "@/lib/api/response";
import { readSessionFromRequest } from "@/lib/auth/session";
import type { AppFeatureId } from "@/lib/auth/features";
import {
  deleteUser,
  findUserById,
  isAuthEnabled,
  listUsers,
  upsertUser,
} from "@/lib/auth/store";

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

  return null;
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  return apiJson({ users: listUsers() });
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  let body: {
    id?: string;
    username?: string;
    password?: string;
    role?: "admin" | "user";
    groupIds?: string[];
    blockedFeatures?: AppFeatureId[];
    enabled?: boolean;
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
      role: body.role === "admin" ? "admin" : "user",
      groupIds: body.groupIds ?? [],
      blockedFeatures: body.blockedFeatures ?? [],
      enabled: body.enabled ?? true,
    });
    return apiJson({ user });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to save user.", 400);
  }
}

export async function DELETE(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  const userId = new URL(request.url).searchParams.get("id")?.trim();
  if (!userId) {
    return apiError("User id is required.", 400);
  }

  try {
    deleteUser(userId);
    return apiJson({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to delete user.", 400);
  }
}
