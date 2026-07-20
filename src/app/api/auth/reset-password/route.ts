import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { isAuthEnabled, ensureAuthStore } from "@/lib/auth/store";
import { consumePasswordResetToken } from "@/lib/auth/password-reset-store";
import { notifyPasswordChanged } from "@/lib/email/notifications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError("Authentication is disabled.", 400);
  }

  let body: { token?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  if (!body.token?.trim() || !body.password?.trim()) {
    return apiError("token and password are required.", 400);
  }

  const result = consumePasswordResetToken(body.token, body.password);
  if (!result.ok) {
    return apiError(result.error, 400);
  }

  const user = ensureAuthStore().users.users.find((entry) => entry.username === result.username);
  if (user) {
    void notifyPasswordChanged({
      userId: user.id,
      username: user.username,
      changedBy: "self",
    });
  }

  return apiJson({ ok: true, username: result.username });
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/auth/reset-password");
}
