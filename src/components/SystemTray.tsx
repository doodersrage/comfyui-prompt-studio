'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  APP_TOAST_EVENT,
  dismissAppToast,
  getAppToasts,
  toastQueueOutcome,
  type AppToast,
} from '@/lib/app-toast';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { RETRY_LAST_FAILED_QUEUE_EVENT, retryLastFailedQueue } from '@/lib/last-failed-queue';
import { dismissSystemTrayMessage, type SystemTrayMessage } from '@/lib/system-tray-messages';
import { useSystemTrayState } from '@/hooks/useSystemTrayState';
import { COMFY_ASSET_JOBS_UPDATED_EVENT } from '@/lib/comfy-asset-events';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { cancelComfyGalleryJob } from '@/lib/comfyui-queue-cancel';
import { TrayNotice } from '@/components/system-tray/TrayNotice';
import { SystemTrayActivityCard } from '@/components/system-tray/SystemTrayActivityCard';

export default function SystemTray() {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [appToasts, setAppToasts] = useState<AppToast[]>([]);
  const [cancellingGalleryIds, setCancellingGalleryIds] = useState<Set<string>>(() => new Set());
  const {
    activeGalleryJobs,
    heldJobs,
    assetJobs,
    queueHealth,
    primary,
    totalActiveCount,
    hasActivity,
    trayMessages,
    refresh,
  } = useSystemTrayState();

  const cancelAssetJob = (jobId: string) => {
    void fetch('/api/comfyui/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', jobId }),
    })
      .then(() => {
        window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
        refresh();
      })
      .catch(() => {
        // tray cancel is best-effort
      });
  };

  const cancelGalleryJob = (entry: ComfyGalleryEntry) => {
    if (!entry.promptId?.trim() || cancellingGalleryIds.has(entry.id)) {
      return;
    }
    setCancellingGalleryIds(prev => new Set(prev).add(entry.id));
    void cancelComfyGalleryJob(entry)
      .then(result => {
        if (!result.ok) {
          toastQueueOutcome({ ok: false, text: result.error ?? 'Cancel failed.' });
          return;
        }
        toastQueueOutcome({ ok: true, text: 'Job cancelled' });
        refresh();
      })
      .catch(() => {
        toastQueueOutcome({ ok: false, text: 'Cancel failed.' });
      })
      .finally(() => {
        setCancellingGalleryIds(prev => {
          const next = new Set(prev);
          next.delete(entry.id);
          return next;
        });
      });
  };

  useEffect(() => {
    const onRetryLastFailed = () => {
      void retryLastFailedQueue().then(result => {
        toastQueueOutcome({
          ok: result.ok,
          text: result.message,
          href: result.ok ? '/gallery' : '/queue',
        });
      });
    };
    window.addEventListener(RETRY_LAST_FAILED_QUEUE_EVENT, onRetryLastFailed);
    return () => window.removeEventListener(RETRY_LAST_FAILED_QUEUE_EVENT, onRetryLastFailed);
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setAppToasts(getAppToasts());
    });
    const onAppToast = (event: Event) => {
      const detail = (event as CustomEvent<AppToast[]>).detail;
      setAppToasts(Array.isArray(detail) ? detail : getAppToasts());
    };
    window.addEventListener(APP_TOAST_EVENT, onAppToast);
    return () => window.removeEventListener(APP_TOAST_EVENT, onAppToast);
  }, []);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  if (!hasActivity && trayMessages.length === 0 && appToasts.length === 0) {
    return null;
  }

  const showActivityCard = hasActivity && primary;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] right-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col ui-tray-stack md:bottom-4"
      data-testid="system-tray"
      aria-live="polite"
    >
      {appToasts.map(toast => (
        <TrayNotice
          key={toast.id}
          text={toast.text}
          tone={toast.tone}
          href={toast.href}
          onDismiss={() => dismissAppToast(toast.id)}
        />
      ))}
      {trayMessages.map((message: SystemTrayMessage) => (
        <TrayNotice
          key={message.id}
          text={message.text}
          tone={message.tone}
          href={message.href}
          actionLabel={message.actionLabel}
          actionEvent={message.actionEvent}
          onDismiss={() => dismissSystemTrayMessage(message.id)}
        />
      ))}

      {showActivityCard ? (
        <SystemTrayActivityCard
          panelId={panelId}
          expanded={expanded}
          setExpanded={setExpanded}
          primary={primary}
          totalActiveCount={totalActiveCount}
          assetJobs={assetJobs}
          activeGalleryJobs={activeGalleryJobs}
          heldJobs={heldJobs}
          queueHealth={queueHealth}
          cancellingGalleryIds={cancellingGalleryIds}
          cancelGalleryJob={cancelGalleryJob}
          cancelAssetJob={cancelAssetJob}
        />
      ) : null}
    </div>
  );
}
