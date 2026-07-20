"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ToolSection } from "@/components/ui/ToolPageShell";
import { exportStudioBackup, importStudioBackup, type StudioBackupV3 } from "@/lib/studio-backup";

export default function ProfileBackupPanel() {
  const [status, setStatus] = useState<string | null>(null);

  function exportBackup() {
    const backup = exportStudioBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `prompt-studio-backup-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Backup downloaded.");
  }

  async function importBackup(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as StudioBackupV3;
      importStudioBackup(parsed);
      setStatus("Backup restored. Reloading…");
      window.setTimeout(() => window.location.reload(), 600);
    } catch {
      setStatus("Invalid backup file.");
    }
  }

  return (
    <ToolSection title="Full backup & restore">
      <p className="mb-3 text-sm text-zinc-400">
        Export or restore your local history, gallery, settings, presets, and workflows.
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
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importBackup(file);
              }
            }}
          />
        </label>
      </div>
      {status ? <p className="mt-2 text-sm text-emerald-400">{status}</p> : null}
    </ToolSection>
  );
}
