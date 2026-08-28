'use client';

import { useWorkflowEditorToolOrchestration } from '@/hooks/useWorkflowEditorToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import WorkflowEditorToolSections from '@/components/workflow-editor/WorkflowEditorToolSections';

export default function WorkflowEditorTool() {
  const description = useToolPageDescription(
    'Load a Comfy API workflow, edit widgets and links, save to the library, and queue through the existing optimizer path.',
    'Edit a workflow graph, save to library, and queue when ready.'
  );
  const vm = useWorkflowEditorToolOrchestration();

  return <WorkflowEditorToolSections description={description} {...vm} />;
}
