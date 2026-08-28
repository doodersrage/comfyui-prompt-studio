'use client';

import {
  usePlayCampaignWizardOrchestration,
  type PlayCampaignWizardProps,
} from '@/hooks/usePlayCampaignWizardOrchestration';
import PlayCampaignWizardSections from '@/components/play/PlayCampaignWizardSections';

export type { PlayCampaignWizardProps };

export default function PlayCampaignWizard(props: PlayCampaignWizardProps) {
  const vm = usePlayCampaignWizardOrchestration(props);

  if (!vm.mounted) {
    return null;
  }

  return <PlayCampaignWizardSections {...vm} />;
}
