import type { ComfyGalleryEntry } from './comfyui-gallery';
import { galleryEntryPrimaryViewUrl } from './comfyui-gallery';

export function isComfyNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestComfyNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!isComfyNotificationSupported()) {
    return 'unsupported';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  return Notification.requestPermission();
}

export function notifyComfyJobComplete(entry: ComfyGalleryEntry): void {
  if (!isComfyNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  const preview = galleryEntryPrimaryViewUrl(entry);
  const body = entry.prompt.length > 140 ? `${entry.prompt.slice(0, 140)}…` : entry.prompt;

  try {
    const notification = new Notification('ComfyUI job completed', {
      body,
      icon: preview ?? undefined,
      tag: entry.promptId,
    });
    notification.onclick = () => {
      window.focus();
      window.location.href = '/gallery';
    };
  } catch {
    // ignore notification failures
  }
}
