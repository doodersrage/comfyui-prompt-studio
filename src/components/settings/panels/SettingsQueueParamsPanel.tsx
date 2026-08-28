'use client';

import QueueParamsPanel from '@/components/QueueParamsPanel';
import { ToolSection } from '@/components/ui/ToolPageShell';

export default function SettingsQueueParamsPanel() {
  return (
    <ToolSection id="settings-comfyui-queue-params" title="Queue parameters">
      <QueueParamsPanel />
    </ToolSection>
  );
}
