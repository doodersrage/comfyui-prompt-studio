'use client';

import type { ReactNode } from 'react';
import ToolPrimarySection from '@/components/ui/ToolPrimarySection';

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
  return (
    <ToolPrimarySection title={title} description={description}>
      {children}
    </ToolPrimarySection>
  );
}
