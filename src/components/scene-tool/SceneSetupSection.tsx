'use client';

import type { ReactNode } from 'react';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { useToolSectionDescription } from '@/hooks/useToolPageDescription';

type SceneSetupSectionProps = {
  /** Full-workspace section description — omitted in Simple mode. */
  description: string;
  title?: string;
  children: ReactNode;
};

/** Shared scene-tool primary block — hides verbose copy in Simple workspace. */
export default function SceneSetupSection({
  title = 'Scene setup',
  description,
  children,
}: SceneSetupSectionProps) {
  const sectionDescription = useToolSectionDescription(description);

  return (
    <ToolSection title={title} description={sectionDescription}>
      {children}
    </ToolSection>
  );
}
