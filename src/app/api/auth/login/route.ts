import { apiError, apiJson } from "@/lib/api/response";
import { createSessionToken, sessionCookieValue } from "@/lib/auth/session";
import { toPublicUser, verifyUserCredentials, isAuthEnabled, listAllowedFeatures } from "@/lib/auth/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError("Authentication is disabled.", 400);
  }

  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  const username = body.username?.trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return apiError("Username and password are required.", 400);
  }

  const user = verifyUserCredentials(username, password);
  if (!user) {
    return apiError("Invalid username or password.", 401);
  }

  const token = createSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  return apiJson(
    {
      user: toPublicUser(user),
      allowedFeatures: listAllowedFeatures(user),
    },
    {
      headers: {
        "Set-Cookie": sessionCookieValue(token),
      },
    },
  );
}
