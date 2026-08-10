'use client';

import dynamic from 'next/dynamic';
import ModalPortal from '@/components/ui/ModalPortal';
import type { GalleryComparePanelProps } from '@/components/GalleryComparePanel';

const GalleryComparePanel = dynamic(() => import('@/components/GalleryComparePanel'), {
  loading: () => null,
});

export type GalleryCompareModalProps = {
  open: boolean;
  entries: GalleryComparePanelProps['entries'];
  onClose: () => void;
} & Omit<GalleryComparePanelProps, 'entries' | 'onClose'>;

export default function GalleryCompareModal({
  open,
  entries,
  onClose,
  ...panelProps
}: GalleryCompareModalProps) {
  if (!open || entries.length < 2) {
    return null;
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[var(--bg-base)]/85 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Compare gallery outputs"
      >
        <div className="my-4 w-full max-w-7xl">
          <GalleryComparePanel entries={entries.slice(0, 4)} onClose={onClose} {...panelProps} />
        </div>
      </div>
    </ModalPortal>
  );
}
