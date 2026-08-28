import type { AppToast } from '@/lib/app-toast';

export type TrayNoticeTone = AppToast['tone'];

export const NOTICE_TONE_CLASS: Record<TrayNoticeTone, string> = {
  neutral: 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
  success:
    'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]',
  warning:
    'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]',
  danger:
    'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]',
  info: 'border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)]',
};
