'use client';

import type { ReactNode } from 'react';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { useToolSectionDescription } from '@/hooks/useToolPageDescription';

type ToolPrimarySectionProps = {
  title: string;
  /** Full-workspace section description — omitted in Simple mode when provided. */
  description?: string;
  children: ReactNode;
};

/** Titled tool block with Simple-aware optional description. */
export default function ToolPrimarySection({
  title,
  description = '',
  children,
}: ToolPrimarySectionProps) {
  const sectionDescription = useToolSectionDescription(description);

  return (
    <ToolSection title={title} description={description.trim() ? sectionDescription : undefined}>
      {children}
    </ToolSection>
  );
}
