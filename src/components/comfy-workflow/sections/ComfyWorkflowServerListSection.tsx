'use client';

import type { ServerWorkflowOption } from '@/hooks/useComfyWorkflowSelection';
import { Button } from '@/components/ui/Button';

type Props = {
  serverFiles: ServerWorkflowOption[];
  selectedId: string | null;
  selectFile: (id: string, name: string) => void;
};

export function ComfyWorkflowServerListSection({ serverFiles, selectedId, selectFile }: Props) {
  if (serverFiles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="type-overline">Server workflow files</p>
      <ul className="ui-list">
        {serverFiles.map(entry => {
          const active = selectedId === entry.id;
          return (
            <li key={entry.id} className="ui-list-row" data-highlight={active ? 'true' : undefined}>
              <div className="ui-list-primary min-w-0">
                <p className="type-heading">{entry.name}</p>
                <p className="type-caption">Server workflow</p>
              </div>
              <Button
                type="button"
                variant={active ? 'accent-outline' : 'secondary'}
                size="sm"
                onClick={() => selectFile(entry.id, entry.name)}
              >
                {active ? 'Selected' : 'Use for Send'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
