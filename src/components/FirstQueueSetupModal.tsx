'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { runHealAndReady } from '@/lib/first-run-setup';
import { COMFY_QUEUE_INTENT_EVENT, hasComfyQueueIntent } from '@/lib/comfy-setup-intent';
import { loadSettingsCache, SETTINGS_CACHE_UPDATED_EVENT } from '@/lib/settings-cache';
import {
  whenBrowserStorageReady,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/browser-storage';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { ONBOARDING_UPDATED_EVENT, loadOnboardingState } from '@/lib/onboarding-store';
import {
  dismissFirstQueueSetupModal,
  FIRST_QUEUE_SETUP_DISMISS_KEY,
} from '@/lib/first-queue-setup';

const DISMISS_KEY = FIRST_QUEUE_SETUP_DISMISS_KEY;

type StepState = {
  storageReady: boolean;
  systemWorkflows: boolean;
  comfyOk: boolean | null;
};

export default function FirstQueueSetupModal() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepState>({
    storageReady: false,
    systemWorkflows: false,
    comfyOk: null,
  });

  const refresh = useCallback(() => {
    const shared = loadSettingsCache().shared;
    setSteps(previous => ({
      ...previous,
      storageReady: true,
      systemWorkflows: shared.useSystemWorkflows === true,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const maybeOpen = () => {
      if (cancelled) {
        return;
      }
      if (readBrowserValue<boolean>(DISMISS_KEY) === true) {
        return;
      }
      if (!hasComfyQueueIntent()) {
        return;
      }
      const shared = loadSettingsCache().shared;
      if (shared.useSystemWorkflows === true) {
        return;
      }
      setOpen(true);
      refresh();
    };

    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      scheduleAfterCommit(maybeOpen);
    });

    const onIntent = () => scheduleAfterCommit(maybeOpen);
    const onSettings = () => scheduleAfterCommit(refresh);
    const onOnboarding = () => {
      const success = loadOnboardingState().find(step => step.id === 'first-queue-success');
      if (success?.done) {
        writeBrowserValue(DISMISS_KEY, true);
        setOpen(false);
      }
    };
    window.addEventListener(COMFY_QUEUE_INTENT_EVENT, onIntent);
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
    window.addEventListener(ONBOARDING_UPDATED_EVENT, onOnboarding);

    void fetch('/api/health')
      .then(response => response.json())
      .then((data: { comfyui?: { ok?: boolean } }) => {
        if (!cancelled) {
          setSteps(previous => ({ ...previous, comfyOk: Boolean(data.comfyui?.ok) }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSteps(previous => ({ ...previous, comfyOk: false }));
        }
      });

    return () => {
      cancelled = true;
      window.removeEventListener(COMFY_QUEUE_INTENT_EVENT, onIntent);
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
      window.removeEventListener(ONBOARDING_UPDATED_EVENT, onOnboarding);
    };
  }, [refresh]);

  if (!open) {
    return null;
  }

  const dismiss = () => {
    dismissFirstQueueSetupModal();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgb(6_10_16/0.55)] p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-queue-setup-title"
    >
      <div className="w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_94%,transparent)] p-5 shadow-[var(--shadow-overlay,0_24px_80px_rgb(0_0_0/0.45))]">
        <div className="space-y-1">
          <p
            id="first-queue-setup-title"
            className="text-lg font-medium text-[var(--text-primary)]"
          >
            Finish setup before your first queue
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Three quick checks so Generate can use system workflows and your ComfyUI inventory.
          </p>
        </div>

        <ol className="mt-5 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className={steps.storageReady ? 'text-emerald-400' : 'text-amber-300'}>
              {steps.storageReady ? '●' : '○'}
            </span>
            <span>
              <span className="font-medium text-[var(--text-primary)]">Browser storage</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Settings and LoRA picks hydrate from IndexedDB.
              </span>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className={
                steps.comfyOk === true
                  ? 'text-emerald-400'
                  : steps.comfyOk === false
                    ? 'text-rose-400'
                    : 'text-amber-300'
              }
            >
              {steps.comfyOk === true ? '●' : '○'}
            </span>
            <span>
              <span className="font-medium text-[var(--text-primary)]">ComfyUI reachable</span>
              <span className="block text-xs text-[var(--text-muted)]">
                {steps.comfyOk === false ? (
                  <>
                    Unreachable — check{' '}
                    <Link
                      href={settingsComfyUiSectionHref('connection')}
                      className="text-[var(--accent-text)] underline-offset-2 hover:underline"
                    >
                      Settings → Connection
                    </Link>
                    .
                  </>
                ) : (
                  'Health probe for object_info / queue.'
                )}
              </span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className={steps.systemWorkflows ? 'text-emerald-400' : 'text-amber-300'}>
              {steps.systemWorkflows ? '●' : '○'}
            </span>
            <span>
              <span className="font-medium text-[var(--text-primary)]">System workflows</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Built-in scaffolds when a library pack is not mapped yet.
              </span>
            </span>
          </li>
        </ol>

        {message ? (
          <p className="mt-4 text-xs text-[var(--text-muted)]" role="status">
            {message}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <PrimaryButton
            className="ui-btn-sm"
            loading={busy}
            loadingLabel="Enabling…"
            onClick={() => {
              setBusy(true);
              void runHealAndReady().then(result => {
                setBusy(false);
                setMessage(result.message);
                setSteps(previous => ({
                  ...previous,
                  systemWorkflows: result.systemWorkflowsEnabled,
                  comfyOk: result.comfyOk ? true : previous.comfyOk,
                }));
                if (result.systemWorkflowsEnabled) {
                  writeBrowserValue(DISMISS_KEY, true);
                  window.setTimeout(() => setOpen(false), 900);
                }
              });
            }}
          >
            Enable & sync inventory
          </PrimaryButton>
          <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
