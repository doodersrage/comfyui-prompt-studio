import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { isAuthEnabled } from "@/lib/auth/store";
import {
  createPasswordResetToken,
  resolveUserForPasswordReset,
} from "@/lib/auth/password-reset-store";
import { sendEmail, isEmailConfigured } from "@/lib/email/mailer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError("Authentication is disabled.", 400);
  }
  if (!isEmailConfigured()) {
    return apiError("Email is not configured.", 503);
  }

  let body: { username?: string; email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  const user = resolveUserForPasswordReset(body);
  if (!user?.email?.trim()) {
    return apiJson({
      ok: true,
      message: "If an account exists with that email, a reset link was sent.",
    });
  }

  const token = createPasswordResetToken(user.id);
  const origin = process.env.PROMPT_API_URL?.trim() || "http://127.0.0.1:47832";
  const resetUrl = `${origin}/login?reset=${encodeURIComponent(token)}`;

  await sendEmail({
    to: user.email,
    subject: "Prompt Studio — password reset",
    text: [
      `Hello ${user.username},`,
      "",
      "Use this link to reset your password (valid for 1 hour):",
      resetUrl,
      "",
      "If you did not request this, ignore this email.",
    ].join("\n"),
  });

  return apiJson({
    ok: true,
    message: "If an account exists with that email, a reset link was sent.",
  });
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/email/forgot-password");
}
