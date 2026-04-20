import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import UserInputNode from './UserInputNode';
import LLMResponseNode from './LLMResponseNode';
import SummaryNode from './SummaryNode';
import CustomEdge from './CustomEdge';
import { useResearchStore } from '../store/researchStore';
import { exportDatabase, saveSessionSnapshot } from '../lib/db';
import {
  buildMarkdownForNode,
  buildMessages,
  createProjectExportPayload,
  getParentNodeId,
  shouldWarnForTokens,
} from '../lib/graph';
import { streamCompletion } from '../services/LLMNetworkClient';

const nodeTypes = {
  userInput: UserInputNode,
  llmResponse: LLMResponseNode,
  summaryNote: SummaryNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

function downloadText(filename, content, contentType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function NodeChat() {
  const reactFlow = useReactFlow();
  const fileInputRef = useRef(null);
  const persistenceTimerRef = useRef(null);
  const abortRef = useRef(null);

  const {
    sessions,
    activeSessionId,
    nodes,
    edges,
    composerMessage,
    isHydrated,
    ui,
    generation,
    initializeWorkspace,
    switchSession,
    createSession,
    renameSession,
    deleteSession,
    importProject,
    setViewport,
    setComposerMessage,
    setGlobalWarning,
    clearGlobalWarning,
    onNodesChange,
    onEdgesChange,
    connectNodes,
    deleteEdge,
    selectNode,
    deleteSelectedNodes,
    updateNodeText,
    updateNodeConfig,
    updateNodeMeasurements,
    setNodeStatus,
    setNodeTokenInfo,
    clearNodeOutput,
    appendNodeChunk,
    setNodeStale,
    markNodesStale,
    createSummaryNode,
    createComposerFlow,
    buildRegenerationTargets,
    queueGeneration,
    shiftGenerationQueue,
    finishGeneration,
  } = useResearchStore((state) => state);

  useEffect(() => {
    initializeWorkspace();
  }, [initializeWorkspace]);

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }

    const unsubscribe = useResearchStore.subscribe((state) => {
      if (!state.isHydrated || !state.activeSessionId) {
        return;
      }

      if (persistenceTimerRef.current) {
        window.clearTimeout(persistenceTimerRef.current);
      }

      persistenceTimerRef.current = window.setTimeout(async () => {
        const snapshot = useResearchStore.getState().snapshotForPersistence();
        if (!snapshot.session) {
          return;
        }

        await saveSessionSnapshot(snapshot.session, snapshot.nodes, snapshot.edges);
      }, 500);
    });

    return () => {
      if (persistenceTimerRef.current) {
        window.clearTimeout(persistenceTimerRef.current);
      }
      unsubscribe();
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    reactFlow.fitView({ padding: 0.2, duration: 250 });
  }, [activeSessionId, isHydrated, reactFlow]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteSelectedNodes();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedNodes]);

  const runAssistantNode = useCallback(async (assistantNodeId) => {
    const state = useResearchStore.getState();
    const assistantNode = state.nodes.find((node) => node.id === assistantNodeId);
    const userNodeId = getParentNodeId(assistantNodeId, state.nodes, state.edges);
    const userNode = state.nodes.find((node) => node.id === userNodeId);

    if (!assistantNode || !userNode) {
      return { skipped: true };
    }

    const tokenInfo = shouldWarnForTokens(userNodeId, state.nodes, state.edges);
    setNodeTokenInfo(userNodeId, tokenInfo.usedTokens, tokenInfo.shouldWarn);

    if (tokenInfo.shouldWarn) {
      setGlobalWarning(`Context usage is ${tokenInfo.usedTokens}/${tokenInfo.maxTokens}. Summarize and branch before continuing.`);
      return { blocked: true };
    }

    setNodeStale(assistantNodeId, false);
    clearNodeOutput(assistantNodeId);
    setNodeStatus(assistantNodeId, 'generating');

    const controller = new AbortController();
    abortRef.current = {
      controller,
      activeNodeId: assistantNodeId,
    };

    const messages = buildMessages(userNodeId, state.nodes, state.edges);
    const config = userNode.data.config;

    try {
      await streamCompletion({
        messages,
        config,
        signal: controller.signal,
        onTextChunk: (chunk) => {
          appendNodeChunk(assistantNodeId, chunk);
        },
        onDone: () => {
          const latestState = useResearchStore.getState();
          const node = latestState.nodes.find((item) => item.id === assistantNodeId);
          const usedTokens = tokenInfo.usedTokens + (node?.data?.text ? node.data.text.length : 0);
          setNodeTokenInfo(assistantNodeId, usedTokens, false);
          setNodeStatus(assistantNodeId, 'done');
        },
        onError: (error) => {
          setNodeStatus(assistantNodeId, 'error', error.message);
        },
      });

      return { done: true };
    } catch (error) {
      if (error.name === 'AbortError') {
        setNodeStatus(assistantNodeId, 'done');
        return { aborted: true };
      }

      setNodeStatus(assistantNodeId, 'error', error.message);
      return { failed: true };
    } finally {
      abortRef.current = null;
    }
  }, [appendNodeChunk, clearNodeOutput, setGlobalWarning, setNodeStale, setNodeStatus, setNodeTokenInfo]);

  const processGenerationQueue = useCallback(async (assistantNodeIds) => {
    if (assistantNodeIds.length === 0) {
      finishGeneration();
      return;
    }

    queueGeneration(assistantNodeIds);
    clearGlobalWarning();

    for (let index = 0; index < assistantNodeIds.length; index += 1) {
      const assistantNodeId = assistantNodeIds[index];
      const result = await runAssistantNode(assistantNodeId);

      if (result?.aborted || result?.blocked || result?.failed) {
        const pendingIds = assistantNodeIds.slice(index + 1);
        if (pendingIds.length > 0 && (result.aborted || result.failed)) {
          markNodesStale(pendingIds);
        }
        break;
      }

      shiftGenerationQueue();
    }

    finishGeneration();
  }, [clearGlobalWarning, finishGeneration, markNodesStale, queueGeneration, runAssistantNode, shiftGenerationQueue]);

  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        style: {
          width: node.data.measurements?.width,
          height: node.data.measurements?.height,
        },
        data: {
          ...node.data,
          onResize: (nodeId, params) => {
            updateNodeMeasurements(nodeId, {
              width: Math.round(params.width),
              height: Math.round(params.height),
            });
          },
          onCommitText: (nodeId, text) => {
            updateNodeText(nodeId, text);
          },
          onUpdateConfig: (nodeId, config) => {
            updateNodeConfig(nodeId, config);
          },
          onRegenerate: async (nodeId) => {
            const queue = buildRegenerationTargets(nodeId);
            await processGenerationQueue(queue);
          },
        },
      })),
    [buildRegenerationTargets, nodes, processGenerationQueue, updateNodeConfig, updateNodeMeasurements, updateNodeText]
  );

  const renderedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          onEdgeClick: deleteEdge,
        },
      })),
    [deleteEdge, edges]
  );

  async function handleSendMessage() {
    if (composerMessage.trim() === '') {
      return;
    }

    const flow = createComposerFlow(composerMessage.trim());
    await processGenerationQueue([flow.assistantNodeId]);
  }

  async function handleAbort() {
    const pendingIds = generation.queue.slice(1);
    if (pendingIds.length > 0) {
      markNodesStale(pendingIds);
    }

    abortRef.current?.controller?.abort();
    finishGeneration();
  }

  function handleAddSummary() {
    const center = reactFlow.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    createSummaryNode(center);
  }

  function handleExportMarkdown() {
    const selectedNode = nodes.find((node) => node.selected);
    if (!selectedNode) {
      setGlobalWarning('Select a node before exporting Markdown.');
      return;
    }

    const markdown = buildMarkdownForNode(selectedNode.id, nodes, edges);
    if (!markdown.trim()) {
      setGlobalWarning('Selected node has no exportable research chain yet.');
      return;
    }

    downloadText(`${selectedNode.id}.md`, markdown, 'text/markdown;charset=utf-8');
  }

  function handleExportProject() {
    exportDatabase().then((snapshot) => {
      const payload = createProjectExportPayload(snapshot);
      downloadText('gitchat-project.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    });
  }

  function handleImportFile(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = JSON.parse(reader.result);
        await importProject(payload);
      } catch (error) {
        setGlobalWarning(`Failed to import project: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  async function handleSessionRename(sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    const nextTitle = window.prompt('Rename session', session?.title || '');
    if (nextTitle && nextTitle.trim()) {
      renameSession(sessionId, nextTitle.trim());
    }
  }

  if (!isHydrated) {
    return <div className="flex h-full items-center justify-center text-slate-600">Loading workspace…</div>;
  }

  return (
    <div className="flex h-full bg-slate-100 text-slate-900">
      <aside className="flex w-[290px] flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Research Sessions
          </div>
          <button
            className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            onClick={() => createSession(`Research ${sessions.length + 1}`)}
          >
            New Session
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-auto p-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`rounded-xl border p-3 ${
                session.id === activeSessionId ? 'border-slate-900 bg-slate-100' : 'border-slate-200 bg-white'
              }`}
            >
              <button
                className="w-full text-left text-sm font-medium"
                onClick={() => switchSession(session.id)}
              >
                {session.title}
              </button>
              <div className="mt-2 flex gap-2 text-xs text-slate-500">
                <button onClick={() => handleSessionRename(session.id)}>Rename</button>
                <button onClick={() => deleteSession(session.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-slate-200 p-4">
          <button
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium"
            onClick={handleAddSummary}
          >
            Add Summary Note
          </button>
          <button
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium"
            onClick={handleExportMarkdown}
          >
            Export Selected Chain
          </button>
          <button
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium"
            onClick={handleExportProject}
          >
            Export Project JSON
          </button>
          <button
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium"
            onClick={() => fileInputRef.current?.click()}
          >
            Import Project JSON
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="application/json"
            onChange={handleImportFile}
          />
        </div>
      </aside>

      <div className="relative flex-1">
        <ReactFlow
          nodes={renderedNodes}
          edges={renderedEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          selectionMode={SelectionMode.Partial}
          panOnScroll
          selectionOnDrag
          panOnDrag={[1, 2]}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(connection) => {
            const success = connectNodes(connection);
            if (!success) {
              setGlobalWarning('Invalid connection. Summary nodes cannot join the DAG, and cycles are blocked.');
            }
          }}
          onNodeClick={(_, node) => selectNode(node.id)}
          onPaneClick={() => clearGlobalWarning()}
          onMove={(_, viewport) => setViewport(viewport)}
          fitView
        >
          <Controls position="top-center" orientation="horizontal" />
          <MiniMap position="top-right" pannable zoomable />
          <Background variant="dots" gap={16} size={1} />
        </ReactFlow>

        <div className="absolute left-6 top-6 z-20 flex max-w-xl flex-col gap-3">
          {ui.globalWarning && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
              {ui.globalWarning}
            </div>
          )}
          {generation.isGenerating && (
            <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-sm text-slate-700">Running {generation.queue.length} queued generations…</div>
              <button
                className="rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white"
                onClick={handleAbort}
              >
                Stop
              </button>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-end gap-3">
            <textarea
              value={composerMessage}
              onChange={(event) => setComposerMessage(event.target.value)}
              className="min-h-[88px] flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none"
              placeholder="Draft a new root question or branch from the selected assistant node."
            />
            <button
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white"
              onClick={handleSendMessage}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NodeChat;
