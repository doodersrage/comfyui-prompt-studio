'use client';

import { LoraTrainPanelForm } from '@/components/settings/lora-train/LoraTrainPanelForm';
import { LoraTrainPanelJobsList } from '@/components/settings/lora-train/LoraTrainPanelJobsList';
import { LoraTrainPanelValidation } from '@/components/settings/lora-train/LoraTrainPanelValidation';
import { useLoraTrainPanel } from '@/components/settings/lora-train/useLoraTrainPanel';

type LoraTrainPanelProps = {
  onStatus?: (message: string) => void;
};

export default function LoraTrainPanel({ onStatus }: LoraTrainPanelProps) {
  const vm = useLoraTrainPanel(onStatus);

  return (
    <div className="space-y-5">
      <LoraTrainPanelForm {...vm} />
      <LoraTrainPanelJobsList {...vm} />
      <LoraTrainPanelValidation {...vm} />
    </div>
  );
}
