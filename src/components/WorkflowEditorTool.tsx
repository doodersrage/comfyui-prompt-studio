'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type NodeProps,
  type Edge,
  type Node,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { FieldLabel, TextArea, TextInput } from '@/components/ui/Field';
import { ToolBadge, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import {
  comfyApiWorkflowToReactFlow,
  listEditableWidgets,
  reactFlowToComfyApiWorkflow,
  updateWorkflowNodeWidget,
  type WorkflowRfNode,
} from '@/lib/workflow-react-flow';
import { parseWorkflowJson } from '@/lib/comfyui-config';
import {
  loadComfyWorkflowFiles,
  saveComfyWorkflowFiles,
  type ComfyWorkflowFile,
} from '@/lib/comfyui-workflow-files';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { optimizeWorkflowForQueue } from '@/lib/workflow-queue-optimizer';
import { assignWorkflowToInferredModels } from '@/lib/model-workflow-map';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { placeholderTokensFromSettings, loadComfyUiSettings } from '@/lib/comfyui-settings';
import { fetchWorkflowPreview } from '@/lib/comfyui-requeue';
import { inferModelsFromWorkflowLabel } from '@/lib/workflow-category-defaults';

function ComfyNodeCard({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowRfNode['data'];
  const widgets = listEditableWidgets(nodeData.inputs);
  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-xl border bg-[var(--bg-base)]/90 px-3 py-2 shadow-lg backdrop-blur ${
        selected ? 'border-violet-400/60' : 'border-[var(--border-default)]/80'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-violet-400" />
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {nodeData.classType}
      </p>
      <p className="text-sm font-medium text-[var(--text-primary)]">{nodeData.title}</p>
      <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--text-muted)]">
        {widgets.slice(0, 4).map(widget => (
          <li key={widget.key} className="truncate">
            {widget.key}: {String(widget.value).slice(0, 28)}
          </li>
        ))}
      </ul>
      <Handle type="source" position={Position.Right} className="!bg-emerald-400" />
    </div>
  );
}

const nodeTypes = { comfy: ComfyNodeCard };

const ACCENT = 'violet' as const;

export default function WorkflowEditorTool() {
  const description = useToolPageDescription(
    'Load a Comfy API workflow, edit widgets and links, save to the library, and queue through the existing optimizer path.',
    'Edit a workflow graph, save to library, and queue when ready.'
  );
  const { shared, updateShared } = useCachedSettings('format', {
    mode: 'positive',
    smartFormat: true,
    draft: '',
  });
  const actions = usePromptResultActions({
    tool: 'workflow-editor',
    model: shared.model,
  });
  const [library, setLibrary] = useState<ComfyWorkflowFile[]>(() =>
    typeof window === 'undefined' ? [] : loadComfyWorkflowFiles()
  );
  const [selectedId, setSelectedId] = useState<string>('');
  const [rawJson, setRawJson] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const loadWorkflowObject = useCallback(
    (workflow: Record<string, unknown>, label: string) => {
      const { nodes: nextNodes, edges: nextEdges } = comfyApiWorkflowToReactFlow(workflow);
      setNodes(nextNodes as Node[]);
      setEdges(nextEdges as Edge[]);
      setRawJson(JSON.stringify(workflow, null, 2));
      setStatus(`Loaded ${label} · ${nextNodes.length} nodes`);
      setSelectedNodeId(null);
    },
    [setEdges, setNodes]
  );

  const onLoadLibrary = useCallback(() => {
    const file = library.find(entry => entry.id === selectedId);
    if (!file?.workflowJson?.trim()) {
      setStatus('Pick a library workflow with JSON.');
      return;
    }
    try {
      const parsed = parseWorkflowJson(file.workflowJson);
      if (!parsed) {
        setStatus('Workflow JSON parsed to empty.');
        return;
      }
      loadWorkflowObject(parsed, file.name);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Parse failed.');
    }
  }, [library, loadWorkflowObject, selectedId]);

  const onLoadJson = useCallback(() => {
    try {
      const parsed = parseWorkflowJson(rawJson);
      if (!parsed) {
        setStatus('JSON parsed to empty.');
        return;
      }
      loadWorkflowObject(parsed, 'pasted JSON');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Parse failed.');
    }
  }, [loadWorkflowObject, rawJson]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds => addEdge(connection, eds));
    },
    [setEdges]
  );

  const selectedRf = useMemo(() => {
    if (!selectedNodeId) {
      return null;
    }
    return (nodes as WorkflowRfNode[]).find(node => node.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const buildWorkflowFromGraph = useCallback(() => {
    return reactFlowToComfyApiWorkflow(
      nodes as WorkflowRfNode[],
      edges as import('@/lib/workflow-react-flow').WorkflowRfEdge[]
    );
  }, [edges, nodes]);

  const onSaveLibrary = useCallback(() => {
    const workflow = buildWorkflowFromGraph();
    const json = JSON.stringify(workflow, null, 2);
    const existing = loadComfyWorkflowFiles();
    const name = selectedId
      ? (existing.find(entry => entry.id === selectedId)?.name ?? 'Edited workflow')
      : 'Edited workflow';
    const id = selectedId || `wf-editor-${Date.now().toString(36)}`;
    const now = Date.now();
    const nextFile: ComfyWorkflowFile = {
      id,
      name,
      workflowJson: json,
      createdAt: existing.find(entry => entry.id === id)?.createdAt ?? now,
    };
    const next = [nextFile, ...existing.filter(entry => entry.id !== id)];
    saveComfyWorkflowFiles(next);
    setLibrary(next);
    setRawJson(json);
    setSelectedId(id);
    setStatus(`Saved “${name}” to workflow library.`);
    return nextFile;
  }, [buildWorkflowFromGraph, selectedId]);

  const onOptimize = useCallback(() => {
    if (nodes.length === 0) {
      setStatus('Load a workflow first.');
      return;
    }
    setBusyAction('optimize');
    try {
      const workflow = buildWorkflowFromGraph();
      const tokens = placeholderTokensFromSettings(loadComfyUiSettings());
      const optimized = optimizeWorkflowForQueue({
        workflow,
        tokens,
        model: shared.model,
        qualityProfile: shared.queueQualityProfile,
      });
      loadWorkflowObject(optimized.workflow, 'optimized graph');
      const changeNotes = optimized.changes
        .filter(change => change.kind !== 'audit')
        .slice(0, 2)
        .map(change => change.message);
      setStatus(
        changeNotes.length > 0
          ? `Optimized for ${shared.model} · ${changeNotes.join(' · ')}.`
          : `Optimized for ${shared.model} · ${optimized.changes.length} note(s).`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Optimize failed.');
    } finally {
      setBusyAction(null);
    }
  }, [
    buildWorkflowFromGraph,
    loadWorkflowObject,
    nodes.length,
    shared.model,
    shared.queueQualityProfile,
  ]);

  const onSetActive = useCallback(() => {
    const saved = onSaveLibrary();
    if (!saved) {
      return;
    }
    const inferred = inferModelsFromWorkflowLabel({
      name: saved.name,
      filename: `${saved.name}.json`,
    });
    const models = inferred.length > 0 ? inferred : [shared.model];
    const cache = loadSettingsCache();
    const nextMap = assignWorkflowToInferredModels(
      saved.id,
      models,
      cache.shared.modelWorkflowMap,
      true
    );
    saveSharedSettings(
      {
        ...cache.shared,
        modelWorkflowMap: nextMap,
        selectedWorkflowFileId: saved.id,
      },
      { notify: false }
    );
    updateShared({ modelWorkflowMap: nextMap, selectedWorkflowFileId: saved.id });
    setStatus(`Active workflow set for ${models.join(', ')}.`);
  }, [onSaveLibrary, shared.model, updateShared]);

  const onDryRun = useCallback(async () => {
    if (nodes.length === 0) {
      setStatus('Load a workflow first.');
      return;
    }
    setBusyAction('dry-run');
    setStatus('Dry-run preview…');
    try {
      const saved = onSaveLibrary();
      const workflow = buildWorkflowFromGraph();
      const positive = Object.values(workflow).find(node => {
        const n = node as { class_type?: string; inputs?: { text?: string } };
        return (
          n.class_type === 'CLIPTextEncode' &&
          typeof n.inputs?.text === 'string' &&
          n.inputs.text.trim()
        );
      }) as { inputs?: { text?: string } } | undefined;
      const prompt = positive?.inputs?.text?.trim() || 'workflow editor dry-run';
      const preview = await fetchWorkflowPreview({
        prompt,
        model: shared.model,
        comfy: {
          ...loadComfyUiSettings(),
          workflowJson: JSON.stringify(workflow),
          workflowFileId: saved?.id,
        },
      });
      if (preview.error) {
        setStatus(preview.error);
        return;
      }
      const issues = preview.preflightIssues?.length
        ? ` · ${preview.preflightIssues.length} preflight issue(s)`
        : '';
      setStatus(`Dry-run ok · source ${preview.workflowSource ?? 'editor'}${issues}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Dry-run failed.');
    } finally {
      setBusyAction(null);
    }
  }, [buildWorkflowFromGraph, nodes.length, onSaveLibrary, shared.model]);

  const onQueue = useCallback(async () => {
    const workflow = buildWorkflowFromGraph();
    const positive = Object.values(workflow).find(node => {
      const n = node as { class_type?: string; inputs?: { text?: string } };
      return (
        n.class_type === 'CLIPTextEncode' &&
        typeof n.inputs?.text === 'string' &&
        n.inputs.text.trim()
      );
    }) as { inputs?: { text?: string } } | undefined;
    const prompt = positive?.inputs?.text?.trim() || 'workflow editor queue';
    setStatus('Queueing from editor…');
    onSaveLibrary();
    await actions.sendComfyUi(prompt);
    setStatus(actions.comfyUiStatus ?? 'Queued.');
  }, [actions, buildWorkflowFromGraph, onSaveLibrary]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>{TOOL_SETUP_LABELS.workflowEditor}</ToolBadge>}
      title="Node graph editor"
      description={description}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.workflowEditor} />
      <ToolSection title="Source">
        <div className="flex flex-wrap gap-2">
          <select
            className="ui-input min-h-10 min-w-[220px]"
            value={selectedId}
            onChange={event => setSelectedId(event.target.value)}
          >
            <option value="">Library workflow…</option>
            {library.map(file => (
              <option key={file.id} value={file.id}>
                {file.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={onLoadLibrary}>
            Open
          </Button>
          <Button type="button" variant="secondary" onClick={onLoadJson}>
            Parse JSON
          </Button>
          <Button type="button" variant="secondary" onClick={onSaveLibrary}>
            Save to library
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onOptimize}
            disabled={nodes.length === 0 || busyAction === 'optimize'}
          >
            Optimize
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onSetActive}
            disabled={nodes.length === 0}
          >
            Set active
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void onDryRun()}
            disabled={nodes.length === 0 || busyAction === 'dry-run'}
          >
            Dry-run
          </Button>
          <PrimaryButton type="button" onClick={() => void onQueue()} disabled={nodes.length === 0}>
            Queue
          </PrimaryButton>
        </div>
        <FieldLabel>Workflow JSON</FieldLabel>
        <TextArea
          rows={4}
          value={rawJson}
          onChange={event => setRawJson(event.target.value)}
          className="font-mono text-xs"
          placeholder="Paste Comfy API-format workflow JSON…"
        />
        {status ? <p className="text-xs text-[var(--text-muted)]">{status}</p> : null}
      </ToolSection>

      <ToolSection title="Graph">
        <div className="h-[480px] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            fitView
            colorMode="dark"
          >
            <Background gap={18} color="#27272a" />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </ToolSection>

      {selectedRf ? (
        <ToolSection title={`Edit · ${selectedRf.data.title}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {listEditableWidgets(selectedRf.data.inputs).map(widget => (
              <label key={widget.key} className="space-y-1 text-xs text-[var(--text-muted)]">
                {widget.key}
                <TextInput
                  value={String(widget.value)}
                  onChange={event => {
                    const raw = event.target.value;
                    const asNum = Number(raw);
                    const nextValue =
                      typeof widget.value === 'number' && Number.isFinite(asNum)
                        ? asNum
                        : typeof widget.value === 'boolean'
                          ? raw === 'true'
                          : raw;
                    setNodes(
                      current =>
                        updateWorkflowNodeWidget(
                          current as WorkflowRfNode[],
                          selectedRf.id,
                          widget.key,
                          nextValue
                        ) as Node[]
                    );
                  }}
                />
              </label>
            ))}
          </div>
        </ToolSection>
      ) : null}
      <MobileStickyQueueBar
        disabled={nodes.length === 0}
        label="Queue workflow"
        status={actions.comfyUiStatus ?? status}
        primaryGenerate
        onQueue={() => void onQueue()}
      />
    </ToolLayout>
  );
}
