import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { readSessionFromRequest } from '@/lib/auth/session';
import { findUserById, isAuthEnabled } from '@/lib/auth/store';
import { getEmailConfig } from '@/lib/email/config';
import {
  readStoredEmailConfig,
  toPublicEmailConfig,
  writeStoredEmailConfig,
  type StoredEmailConfig,
} from '@/lib/email/store';

export const runtime = 'nodejs';

function requireAdmin(request: Request) {
  if (!isAuthEnabled()) {
    return null;
  }
  const session = readSessionFromRequest(request);
  const user = session ? findUserById(session.userId) : null;
  if (!user?.enabled || user.role !== 'admin') {
    return apiError('Admin sign-in required.', 401);
  }
  return null;
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }
  const stored = readStoredEmailConfig();
  return apiJson(toPublicEmailConfig(getEmailConfig(), Boolean(stored)));
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }
  const body = (await request.json().catch(() => ({}))) as StoredEmailConfig;
  const result = writeStoredEmailConfig(body);
  return apiJson({
    ...toPublicEmailConfig(getEmailConfig(), result.persisted),
    persisted: result.persisted,
  });
}

export async function DELETE() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/settings/email');
}
