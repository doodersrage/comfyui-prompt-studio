import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { readSessionFromRequest } from "@/lib/auth/session";
import { findUserById, isAuthEnabled } from "@/lib/auth/store";
import { sendEmail, isEmailConfigured } from "@/lib/email/mailer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return apiError("Authentication is disabled.", 400);
  }
  if (!isEmailConfigured()) {
    return apiError("Email is not configured on the server.", 503);
  }

  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user?.enabled) {
    return apiError("Sign in required.", 401);
  }

  const body = (await request.json().catch(() => ({}))) as { to?: string };
  const to = body.to?.trim() || user.email?.trim();
  if (!to) {
    return apiError("Add an email on Profile or pass { to } in the request body.", 400);
  }

  const result = await sendEmail({
    to,
    subject: "Prompt Studio — test email",
    text: [
      `Hello ${user.username},`,
      "",
      "This is a test message from your Prompt Studio server.",
      "",
      `Sent: ${new Date().toLocaleString()}`,
    ].join("\n"),
  });

  if (!result.ok) {
    return apiError(result.error ?? "Failed to send test email.", 502);
  }

  return apiJson({ ok: true, to });
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/email/test");
}
