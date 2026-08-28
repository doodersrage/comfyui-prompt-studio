'use client';

import { Button } from '@/components/ui/Button';
import { chromeBtn } from '@/components/ui/image-lightbox/chromeBtn';

const SHORTCUT_ROWS = [
  ['← / → · wheel', 'Previous / next'],
  ['Click · Z · pinch', 'Zoom (Esc or click again resets)'],
  ['1–5', 'Rate'],
  ['B · Shift+F', 'Favorite'],
  ['M', 'Details / metadata'],
  ['V', 'Fit: contain → cover → 1:1'],
  ['X', 'Before / after wipe'],
  ['Y', 'Side-by-side pair mode'],
  ['H', 'Color / histogram peek'],
  ['N', 'Toggle actions drawer'],
  ['C / I', 'Compose / Improve'],
  ['A', 'Toggle compare selection'],
  ['P / G / S', 'Parent / derivatives / sibling'],
  ['D', 'Download'],
  ['O', 'Toggle full-res preview'],
  ['Delete', 'Remove (confirm)'],
  ['? · Esc', 'Help / dismiss'],
] as const;

type ImageLightboxHelpOverlayProps = {
  open: boolean;
  compact?: boolean;
  onClose: () => void;
};

export default function ImageLightboxHelpOverlay({
  open,
  compact = false,
  onClose,
}: ImageLightboxHelpOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="ui-lightbox-panel absolute inset-x-4 top-16 z-[40] mx-auto max-w-md p-4 sm:inset-x-auto"
      data-immersive={compact ? 'true' : undefined}
      role="dialog"
      aria-label="Lightbox shortcuts"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="type-heading text-[15px]">Shortcuts</p>
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          className={chromeBtn(compact)}
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      <ul className="space-y-1.5">
        {SHORTCUT_ROWS.map(([keys, label]) => (
          <li key={keys} className="flex items-baseline justify-between gap-4 text-[12px]">
            <span
              className={`font-medium ${compact ? 'text-white' : 'text-[var(--text-primary)]'}`}
            >
              {keys}
            </span>
            <span className={compact ? 'text-white/65' : 'text-[var(--text-muted)]'}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
