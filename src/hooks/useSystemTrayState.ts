'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  loadComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { comfyUiJobProgressPercent } from '@/lib/comfyui-job-status';
import { HELD_MAX_UPDATED_EVENT, listHeldMaxJobs, type HeldMaxJob } from '@/lib/held-max-queue';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

export type SystemTrayAssetJob = {
  id: string;
  label: string;
  status: 'queued' | 'downloading' | 'verifying' | 'complete' | 'error';
  progress: number;
};

export type SystemTrayQueueHealth = {
  queuePending: number;
  queueRunning: number;
  ok: boolean;
};

export type SystemTrayPrimary =
  | { kind: 'gallery'; entry: ComfyGalleryEntry; percent: number | null }
  | { kind: 'asset'; job: SystemTrayAssetJob }
  | { kind: 'held'; count: number; label: string }
  | { kind: 'queue'; pending: number; running: number };

export type SystemTrayState = {
  activeGalleryJobs: ComfyGalleryEntry[];
  heldJobs: HeldMaxJob[];
  assetJobs: SystemTrayAssetJob[];
  queueHealth: SystemTrayQueueHealth | null;
  primary: SystemTrayPrimary | null;
  totalActiveCount: number;
  hasActivity: boolean;
  refresh: () => void;
};

const ACTIVE_ASSET_STATUSES = new Set(['queued', 'downloading', 'verifying']);

function sortActiveGalleryJobs(entries: ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  return [...entries].sort((left, right) => {
    if (left.status === 'running' && right.status !== 'running') {
      return -1;
    }
    if (right.status === 'running' && left.status !== 'running') {
      return 1;
    }
    const leftPos = left.queuePosition ?? Number.MAX_SAFE_INTEGER;
    const rightPos = right.queuePosition ?? Number.MAX_SAFE_INTEGER;
    if (leftPos !== rightPos) {
      return leftPos - rightPos;
    }
    return right.queuedAt - left.queuedAt;
  });
}

function resolvePrimary(
  activeGalleryJobs: ComfyGalleryEntry[],
  assetJobs: SystemTrayAssetJob[],
  heldJobs: HeldMaxJob[],
  queueHealth: SystemTrayQueueHealth | null
): SystemTrayPrimary | null {
  const running = activeGalleryJobs.find(entry => entry.status === 'running');
  if (running) {
    return { kind: 'gallery', entry: running, percent: comfyUiJobProgressPercent(running) };
  }

  const downloading = assetJobs.find(
    job => job.status === 'downloading' || job.status === 'verifying'
  );
  if (downloading) {
    return { kind: 'asset', job: downloading };
  }

  const queuedAsset = assetJobs.find(job => job.status === 'queued');
  if (queuedAsset) {
    return { kind: 'asset', job: queuedAsset };
  }

  const pending = activeGalleryJobs.find(entry => entry.status === 'pending');
  if (pending) {
    return { kind: 'gallery', entry: pending, percent: null };
  }

  if (heldJobs.length > 0) {
    return {
      kind: 'held',
      count: heldJobs.length,
      label: heldJobs[0]?.label ?? 'Held Max job',
    };
  }

  if (queueHealth && (queueHealth.queueRunning > 0 || queueHealth.queuePending > 0)) {
    return {
      kind: 'queue',
      pending: queueHealth.queuePending,
      running: queueHealth.queueRunning,
    };
  }

  return null;
}

export function useSystemTrayState(options?: { pollAssets?: boolean }): SystemTrayState {
  const pollAssets = options?.pollAssets ?? true;
  const [galleryEntries, setGalleryEntries] = useState<ComfyGalleryEntry[]>([]);
  const [heldJobs, setHeldJobs] = useState<HeldMaxJob[]>([]);
  const [assetJobs, setAssetJobs] = useState<SystemTrayAssetJob[]>([]);
  const [queueHealth, setQueueHealth] = useState<SystemTrayQueueHealth | null>(null);

  const refreshGallery = useCallback(() => {
    setGalleryEntries(loadComfyGallery());
  }, []);

  const refreshHeld = useCallback(() => {
    setHeldJobs(listHeldMaxJobs());
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        setQueueHealth(null);
        return;
      }
      const data = (await response.json()) as {
        comfyui?: { queuePending?: number; queueRunning?: number; ok?: boolean };
      };
      const comfy = data.comfyui;
      if (!comfy) {
        setQueueHealth(null);
        return;
      }
      setQueueHealth({
        queuePending: comfy.queuePending ?? 0,
        queueRunning: comfy.queueRunning ?? 0,
        ok: comfy.ok ?? false,
      });
    } catch {
      setQueueHealth(null);
    }
  }, []);

  const refreshAssets = useCallback(async () => {
    if (!pollAssets) {
      return;
    }
    try {
      const response = await fetch('/api/comfyui/assets');
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        jobs?: Array<{
          id: string;
          label: string;
          status: SystemTrayAssetJob['status'];
          progress: number;
        }>;
      };
      const jobs = (data.jobs ?? [])
        .filter(job => ACTIVE_ASSET_STATUSES.has(job.status))
        .map(job => ({
          id: job.id,
          label: job.label,
          status: job.status,
          progress: job.progress,
        }));
      setAssetJobs(jobs);
    } catch {
      // ignore — asset downloads are optional tray content
    }
  }, [pollAssets]);

  const refresh = useCallback(() => {
    refreshGallery();
    refreshHeld();
    void refreshHealth();
    void refreshAssets();
  }, [refreshAssets, refreshGallery, refreshHeld, refreshHealth]);

  useEffect(() => {
    scheduleAfterCommit(refresh);

    const onGallery = () => refreshGallery();
    const onHeld = () => refreshHeld();

    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGallery);
    window.addEventListener(HELD_MAX_UPDATED_EVENT, onHeld);
    window.addEventListener('storage', onHeld);

    const galleryInterval = window.setInterval(refreshGallery, 4000);
    const healthInterval = window.setInterval(() => {
      void refreshHealth();
    }, 20000);
    const assetInterval = window.setInterval(() => {
      void refreshAssets();
    }, 8000);

    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGallery);
      window.removeEventListener(HELD_MAX_UPDATED_EVENT, onHeld);
      window.removeEventListener('storage', onHeld);
      window.clearInterval(galleryInterval);
      window.clearInterval(healthInterval);
      window.clearInterval(assetInterval);
    };
  }, [refresh, refreshAssets, refreshGallery, refreshHealth, refreshHeld]);

  const activeGalleryJobs = useMemo(
    () =>
      sortActiveGalleryJobs(
        galleryEntries.filter(entry => entry.status === 'pending' || entry.status === 'running')
      ),
    [galleryEntries]
  );

  const primary = useMemo(
    () => resolvePrimary(activeGalleryJobs, assetJobs, heldJobs, queueHealth),
    [activeGalleryJobs, assetJobs, heldJobs, queueHealth]
  );

  const totalActiveCount = activeGalleryJobs.length + heldJobs.length + assetJobs.length;

  const hasActivity =
    totalActiveCount > 0 ||
    (queueHealth != null && (queueHealth.queuePending > 0 || queueHealth.queueRunning > 0));

  return {
    activeGalleryJobs,
    heldJobs,
    assetJobs,
    queueHealth,
    primary,
    totalActiveCount,
    hasActivity,
    refresh,
  };
}
