'use client';

import { useRef } from 'react';
import { pngMetadataToSidecar, readPngMetadataFile } from '@/lib/png-metadata';
import type { PromptSidecar } from '@/lib/prompt-sidecar';

type PngMetadataImportButtonProps = {
  onImport: (sidecar: PromptSidecar) => void;
  onError?: (message: string) => void;
  label?: string;
  className?: string;
};

export default function PngMetadataImportButton({
  onImport,
  onError,
  label = 'Import PNG metadata',
  className = 'cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500',
}: PngMetadataImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label className={className}>
      {label}
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }

          void readPngMetadataFile(file)
            .then(metadata => onImport(pngMetadataToSidecar(metadata)))
            .catch(error => {
              onError?.(error instanceof Error ? error.message : 'PNG metadata import failed.');
            })
            .finally(() => {
              event.target.value = '';
            });
        }}
      />
    </label>
  );
}
