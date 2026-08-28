'use client';

import ComfyModelAssetsPanel from '@/components/settings/ComfyModelAssetsPanel';
import { ToolSection } from '@/components/ui/ToolPageShell';

export type SettingsModelAssetsPanelProps = {
  setStatus: (status: string | null) => void;
  syncLoaderMapsFromComfyInventory: () => void | Promise<void>;
};

export default function SettingsModelAssetsPanel({
  setStatus,
  syncLoaderMapsFromComfyInventory,
}: SettingsModelAssetsPanelProps) {
  return (
    <ToolSection id="settings-comfyui-model-assets" title="Model assets">
      <ComfyModelAssetsPanel
        onStatus={setStatus}
        onInstalled={() => {
          void syncLoaderMapsFromComfyInventory();
        }}
      />
    </ToolSection>
  );
}
