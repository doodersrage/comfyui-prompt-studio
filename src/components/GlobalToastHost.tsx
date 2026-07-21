"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  APP_TOAST_EVENT,
  dismissAppToast,
  getAppToasts,
  type AppToast,
} from "@/lib/app-toast";

const TONE_CLASS: Record<AppToast["tone"], string> = {
  neutral:
    "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  success:
    "border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]",
  warning:
    "border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]",
  danger:
    "border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]",
  info: "border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)]",
};

export default function GlobalToastHost() {
  const [toasts, setToasts] = useState<AppToast[]>([]);

  useEffect(() => {
    setToasts(getAppToasts());
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<AppToast[]>).detail;
      setToasts(Array.isArray(detail) ? detail : getAppToasts());
    };
    window.addEventListener(APP_TOAST_EVENT, onUpdate);
    return () => window.removeEventListener(APP_TOAST_EVENT, onUpdate);
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto rounded-[var(--radius-lg)] border px-3 py-2.5 shadow-[var(--shadow-surface)] backdrop-blur-md ${TONE_CLASS[toast.tone]}`}
        >
          <div className="flex items-start gap-3">
            <p className="type-caption min-w-0 flex-1 leading-relaxed">{toast.text}</p>
            <div className="flex shrink-0 items-center gap-2">
              {toast.href ? (
                <Link
                  href={toast.href}
                  className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  onClick={() => dismissAppToast(toast.id)}
                >
                  Open
                </Link>
              ) : null}
              <button
                type="button"
                aria-label="Dismiss"
                className="type-caption text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                onClick={() => dismissAppToast(toast.id)}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
