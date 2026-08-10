import { readBrowserString, writeBrowserString } from './browser-storage';

export type SystemTrayMessageTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type SystemTrayMessage = {
  id: string;
  text: string;
  tone: SystemTrayMessageTone;
  href?: string;
  at: number;
};

export const SYSTEM_TRAY_MESSAGES_EVENT = 'system-tray-messages';

const MAX_VISIBLE = 4;
const DEFAULT_TTL_MS = 6500;

let messages: SystemTrayMessage[] = [];

export function getSystemTrayMessages(): SystemTrayMessage[] {
  return [...messages];
}

function emit(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(SYSTEM_TRAY_MESSAGES_EVENT, { detail: getSystemTrayMessages() })
  );
}

export function pushSystemTrayMessage(input: {
  text: string;
  tone?: SystemTrayMessageTone;
  href?: string;
  ttlMs?: number;
}): string | null {
  const text = input.text.trim();
  if (!text || typeof window === 'undefined') {
    return null;
  }
  if (!loadToastPreferenceEnabled()) {
    return null;
  }
  const id = crypto.randomUUID();
  const entry: SystemTrayMessage = {
    id,
    text,
    tone: input.tone ?? 'neutral',
    href: input.href,
    at: Date.now(),
  };
  messages = [entry, ...messages].slice(0, MAX_VISIBLE);
  emit();
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
  if (ttl > 0) {
    window.setTimeout(() => {
      dismissSystemTrayMessage(id);
    }, ttl);
  }
  return id;
}

export function dismissSystemTrayMessage(id: string): void {
  const before = messages.length;
  messages = messages.filter(message => message.id !== id);
  if (messages.length !== before) {
    emit();
  }
}

export function clearSystemTrayMessages(): void {
  if (messages.length === 0) {
    return;
  }
  messages = [];
  emit();
}

export function rememberToastPreference(enabled: boolean): void {
  writeBrowserString('comfy-app-toast-enabled-v1', enabled ? '1' : '0');
}

export function loadToastPreferenceEnabled(): boolean {
  const value = readBrowserString('comfy-app-toast-enabled-v1');
  return value !== '0';
}
