'use client';

import dynamic from 'next/dynamic';

const DiffusersWorkflowSupportHint = dynamic(
  () => import('@/components/DiffusersWorkflowSupportHint'),
  { ssr: false }
);

type DiffusersQueueHintProps = {
  workflowJson?: string | null;
};

/** Queue-time Diffusers classify hint when Diffusers engine + workflow JSON are active. */
export default function DiffusersQueueHint({ workflowJson }: DiffusersQueueHintProps) {
  if (!workflowJson?.trim()) {
    return null;
  }
  return <DiffusersWorkflowSupportHint workflowJson={workflowJson} className="mt-2" />;
}
