import { removeBrowserKey, writeBrowserValue } from './browser-storage';

export const FIRST_QUEUE_SETUP_DISMISS_KEY = 'comfy-first-queue-setup-dismiss-v1';
export const FIRST_QUEUE_SETUP_RESET_EVENT = 'comfy-first-queue-setup-reset';

export function dismissFirstQueueSetupModal(): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(FIRST_QUEUE_SETUP_DISMISS_KEY, true);
}

/** Clear dismiss flag and ask the modal to re-open on next queue intent / immediately. */
export function resetFirstQueueSetupModal(): void {
  if (typeof window === 'undefined') {
    return;
  }
  removeBrowserKey(FIRST_QUEUE_SETUP_DISMISS_KEY);
  window.dispatchEvent(new Event(FIRST_QUEUE_SETUP_RESET_EVENT));
}
