'use client';

import { useSettingsToolOrchestration } from '@/hooks/useSettingsToolOrchestration';
import SettingsToolSections from '@/components/settings/SettingsToolSections';

export default function SettingsTool() {
  const vm = useSettingsToolOrchestration();
  return <SettingsToolSections {...vm} />;
}
