'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  downloadStudioBackup,
  importStudioBackup,
  parseStudioBackupFile,
} from '@/lib/studio-backup';

export default function ProfileBackupPanel() {
  const [status, setStatus] = useState<string | null>(null);

  function exportBackup() {
    downloadStudioBackup();
    setStatus('Backup downloaded.');
  }

  async function importBackup(file: File) {
    try {
      const text = await file.text();
      importStudioBackup(parseStudioBackupFile(text));
      setStatus('Backup restored. Reloading…');
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Invalid backup file.');
    }
  }

  return (
    <ToolSection title="Full backup & restore">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Export or restore history, gallery, settings, extras (gallery ELO, recipes, views), and
        workflows. On a new machine, import this JSON then reload.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={exportBackup}>
          Download backup
        </Button>
        <label className="ui-btn ui-btn-secondary cursor-pointer">
          Restore backup
          <input
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) {
                void importBackup(file);
              }
            }}
          />
        </label>
      </div>
      {status ? <p className="mt-2 text-sm text-[var(--tint-success-text)]">{status}</p> : null}
    </ToolSection>
  );
}
