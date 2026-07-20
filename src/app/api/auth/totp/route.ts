import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { resolveRequestUser } from "@/lib/auth/access";
import { findUserById, updateUserProfile } from "@/lib/auth/store";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/auth/totp";
import { appendAuditLog } from "@/lib/auth/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiError("Sign in required.", 401);
  }
  return apiJson({ enabled: Boolean(user.totpEnabled) });
}

export async function POST(request: Request) {
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return apiError("Sign in required.", 401);
  }
  const body = (await request.json()) as { action?: string; code?: string; currentPassword?: string };
  const full = findUserById(user.id);
  if (!full) {
    return apiError("User not found.", 404);
  }

  if (body.action === "begin-setup") {
    const secret = generateTotpSecret();
    updateUserProfile(user.id, { totpSecret: secret, totpEnabled: false });
    return apiJson({
      secret,
      uri: totpUri(user.username, secret),
    });
  }

  if (body.action === "confirm") {
    if (!full.totpSecret || !body.code || !verifyTotp(full.totpSecret, body.code)) {
      return apiError("Invalid authenticator code.", 400);
    }
    updateUserProfile(user.id, { totpEnabled: true });
    appendAuditLog({
      actorUserId: user.id,
      actorUsername: user.username,
      action: "totp.enabled",
      details: "TOTP enabled",
    });
    return apiJson({ enabled: true });
  }

  if (body.action === "disable") {
    updateUserProfile(user.id, {
      currentPassword: body.currentPassword,
      totpSecret: undefined,
      totpEnabled: false,
    });
    return apiJson({ enabled: false });
  }

  return apiError("Unknown action.", 400);
}

export async function OPTIONS() {
  return apiMethodNotAllowed(["GET", "POST"], "/api/auth/totp");
}
