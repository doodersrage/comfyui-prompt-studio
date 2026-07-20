import { apiJson } from "@/lib/api/response";
import { readSessionFromRequest } from "@/lib/auth/session";
import {
  findUserById,
  getAuthBootstrapInfo,
  isAuthEnabled,
  listAllowedFeatures,
  toPublicUser,
} from "@/lib/auth/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authEnabled = isAuthEnabled();
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;

  return apiJson({
    authEnabled,
    defaultAdminUsername: getAuthBootstrapInfo().defaultAdminUsername,
    user: user && user.enabled ? toPublicUser(user) : null,
    allowedFeatures: user && user.enabled ? listAllowedFeatures(user) : authEnabled ? [] : "all",
  });
}
