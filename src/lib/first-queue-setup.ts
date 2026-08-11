import { writeBrowserValue } from './browser-storage';

export const FIRST_QUEUE_SETUP_DISMISS_KEY = 'comfy-first-queue-setup-dismiss-v1';

export function dismissFirstQueueSetupModal(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(FIRST_QUEUE_SETUP_DISMISS_KEY, true);
}
