import { apiJson } from "@/lib/api/response";
import { clearSessionCookieValue } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  return apiJson(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookieValue(),
      },
    },
  );
}
