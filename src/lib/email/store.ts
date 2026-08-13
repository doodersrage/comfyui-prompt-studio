import fs from 'node:fs';
import path from 'node:path';
import type { EmailConfig } from './types';
import type { PublicEmailConfig, StoredEmailConfig } from './types';

export type { PublicEmailConfig, StoredEmailConfig } from './types';

function emailConfigPath(): string | null {
  const dir = process.env.PROMPT_DATA_DIR?.trim();
  if (!dir) {
    return null;
  }
  return path.join(path.resolve(dir), 'email-config.json');
}

export function readStoredEmailConfig(): StoredEmailConfig | null {
  const filePath = emailConfigPath();
  if (!filePath) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoredEmailConfig;
  } catch {
    return null;
  }
}

export function writeStoredEmailConfig(input: StoredEmailConfig): {
  persisted: boolean;
  config: StoredEmailConfig;
} {
  const filePath = emailConfigPath();
  if (!filePath) {
    return { persisted: false, config: input };
  }
  const current = readStoredEmailConfig() ?? {};
  const next: StoredEmailConfig = {
    ...current,
    ...input,
    smtp: {
      ...current.smtp,
      ...input.smtp,
    },
  };
  if (input.smtp && input.smtp.pass === '') {
    next.smtp = { ...next.smtp, pass: current.smtp?.pass };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return { persisted: true, config: next };
}

export function overlayEmailConfig(
  base: EmailConfig,
  stored: StoredEmailConfig | null
): EmailConfig {
  if (!stored) {
    return base;
  }
  const host = stored.smtp?.host?.trim() || base.smtp.host;
  const from = stored.from?.trim() || base.from;
  const enabled =
    stored.enabled === true || stored.enabled === false
      ? stored.enabled
      : base.enabled || (Boolean(host) && Boolean(from));
  return {
    enabled,
    from,
    adminEmail: stored.adminEmail?.trim() || base.adminEmail,
    smtp: {
      host,
      port:
        typeof stored.smtp?.port === 'number' && Number.isFinite(stored.smtp.port)
          ? stored.smtp.port
          : base.smtp.port,
      secure: stored.smtp?.secure ?? base.smtp.secure,
      user: stored.smtp?.user?.trim() || base.smtp.user,
      pass: stored.smtp?.pass?.trim() || base.smtp.pass,
    },
    notifyBatch: stored.notifyBatch ?? base.notifyBatch,
    notifyPassword: stored.notifyPassword ?? base.notifyPassword,
  };
}

export function toPublicEmailConfig(config: EmailConfig, persisted: boolean): PublicEmailConfig {
  return {
    persisted,
    enabled: config.enabled,
    from: config.from,
    adminEmail: config.adminEmail,
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      user: config.smtp.user,
      hasPassword: Boolean(config.smtp.pass),
    },
    notifyBatch: config.notifyBatch,
    notifyPassword: config.notifyPassword,
  };
}
