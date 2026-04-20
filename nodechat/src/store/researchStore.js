import { create } from 'zustand';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import {
  getChildNodeIds,
  getDescendantNodeIds,
  getParentNodeId,
  isValidDagConnection,
} from '../lib/graph';
import { extractToolPayload } from '../lib/toolPayload';
import { deleteSessionSnapshot, listSessions, loadSessionSnapshot, replaceDatabase, saveSessionSnapshot } from '../lib/db';
import { DEFAULT_MODEL, normalizeModelId } from '../lib/models';
const DEFAULT_NODE_SIZE = {
  userInput: { width: 320, height: 220 },
  llmResponse: { width: 380, height: 240 },
  summaryNote: { width: 320, height: 220 },
};

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSession(title = 'Untitled Research') {
  const now = Date.now();
  return {
    id: createId('session'),
    title,
    createdAt: now,
    updatedAt: now,
  };
}

function createNodeData(type, text = '') {
  const size = DEFAULT_NODE_SIZE[type];

  return {
    text,
    rawText: text,
    createdAt: Date.now(),
    config: {
      model: DEFAULT_MODEL,
      enableWebSearch: false,
      enableThinking: false,
      systemPromptOverride: '',
    },
    toolPayload: [],
    metadata: {
      accumulatedTokens: 0,
      isStale: false,
      errorMessage: '',
      tokenWarning: false,
    },
    status: 'draft',
    measurements: { ...size },
  };
}

function createNode(type, position, text = '') {
  return {
    id: createId(type),
    type,
    position,
    selected: false,
    data: createNodeData(type, text),
  };
}

function cloneNode(node, position) {
  return {
    ...node,
    id: createId(node.type),
    position,
    selected: false,
    data: {
      ...node.data,
      createdAt: Date.now(),
    },
  };
}

function touchSession(session) {
  if (!session) {
    return session;
  }

  return {
    ...session,
    updatedAt: Date.now(),
  };
}

function serializeNodes(nodes, sessionId) {
  return nodes.map((node) => ({
    ...node,
    sessionId,
    updatedAt: Date.now(),
  }));
}

function serializeEdges(edges, sessionId) {
  return edges.map((edge) => ({
    ...edge,
    sessionId,
    updatedAt: Date.now(),
  }));
}

export const useResearchStore = create((set, get) => ({
  sessions: [],
  activeSessionId: null,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  composerMessage: '',
  isHydrated: false,
  ui: {
    selectedNodeId: null,
    globalWarning: '',
  },
  generation: {
    isGenerating: false,
    activeNodeId: null,
    queue: [],
  },

  async initializeWorkspace() {
    const sessions = await listSessions();

    if (sessions.length === 0) {
      const session = createSession('Research Workspace');
      await saveSessionSnapshot(session, [], []);
      set({
        sessions: [session],
        activeSessionId: session.id,
        nodes: [],
        edges: [],
        isHydrated: true,
      });
      return;
    }

    const activeSession = sessions[0];
    const snapshot = await loadSessionSnapshot(activeSession.id);

    set({
      sessions,
      activeSessionId: activeSession.id,
      nodes: snapshot.nodes || [],
      edges: snapshot.edges || [],
      isHydrated: true,
    });
  },

  async switchSession(sessionId) {
    const snapshot = await loadSessionSnapshot(sessionId);
    set({
      activeSessionId: sessionId,
      nodes: snapshot.nodes || [],
      edges: snapshot.edges || [],
      ui: {
        ...get().ui,
        selectedNodeId: null,
        globalWarning: '',
      },
    });
  },

  createSession(title = 'New Session') {
    const session = createSession(title);
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
      nodes: [],
      edges: [],
      ui: {
        ...state.ui,
        selectedNodeId: null,
      },
    }));
    return session;
  },

  renameSession(sessionId, title) {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId ? touchSession({ ...session, title }) : session
      ),
    }));
  },

  async deleteSession(sessionId) {
    const state = get();
    const remaining = state.sessions.filter((session) => session.id !== sessionId);
    await deleteSessionSnapshot(sessionId);

    if (remaining.length === 0) {
      const session = createSession('Research Workspace');
      set({
        sessions: [session],
        activeSessionId: session.id,
        nodes: [],
        edges: [],
      });
      return;
    }

    const nextSessionId = state.activeSessionId === sessionId ? remaining[0].id : state.activeSessionId;
    const snapshot = await loadSessionSnapshot(nextSessionId);

    set({
      sessions: remaining,
      activeSessionId: nextSessionId,
      nodes: snapshot.nodes || [],
      edges: snapshot.edges || [],
      ui: {
        ...state.ui,
        selectedNodeId: null,
      },
    });
  },

  async importProject(payload) {
    await replaceDatabase(payload);
    const sessions = await listSessions();
    const nextSession = sessions[0] || createSession('Research Workspace');
    const snapshot = await loadSessionSnapshot(nextSession.id);

    set({
      sessions,
      activeSessionId: nextSession.id,
      nodes: snapshot.nodes || [],
      edges: snapshot.edges || [],
      ui: {
        selectedNodeId: null,
        globalWarning: '',
      },
      generation: {
        isGenerating: false,
        activeNodeId: null,
        queue: [],
      },
    });
  },

  setViewport(viewport) {
    set({ viewport });
  },

  setComposerMessage(message) {
    set({ composerMessage: message });
  },

  setGlobalWarning(globalWarning) {
    set((state) => ({
      ui: {
        ...state.ui,
        globalWarning,
      },
    }));
  },

  clearGlobalWarning() {
    set((state) => ({
      ui: {
        ...state.ui,
        globalWarning: '',
      },
    }));
  },

  onNodesChange(changes) {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
  },

  onEdgesChange(changes) {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  connectNodes(connection) {
    const state = get();
    if (!isValidDagConnection(connection, state.nodes, state.edges)) {
      return false;
    }

    const edge = {
      id: createId('edge'),
      source: connection.source,
      target: connection.target,
      type: 'custom',
      data: {},
    };

    set({
      edges: [...state.edges, edge],
    });
    return true;
  },

  deleteEdge(edgeId) {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== edgeId),
    }));
  },

  clearSelection() {
    set((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, selected: false })),
      ui: {
        ...state.ui,
        selectedNodeId: null,
      },
    }));
  },

  selectNode(nodeId) {
    set((state) => ({
      nodes: state.nodes.map((node) => ({
        ...node,
        selected: node.id === nodeId,
      })),
      ui: {
        ...state.ui,
        selectedNodeId: nodeId,
      },
    }));
  },

  deleteSelectedNodes() {
    const { nodes, edges } = get();
    const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));

    set({
      nodes: nodes.filter((node) => !selectedIds.has(node.id)),
      edges: edges.filter((edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)),
      ui: {
        ...get().ui,
        selectedNodeId: null,
      },
    });
  },

  updateNodeText(nodeId, text, updateRaw = true) {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            text,
            rawText: updateRaw ? text : node.data.rawText,
          },
        };
      }),
    }));
  },

  updateNodeConfig(nodeId, nextConfig) {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            config: {
              ...node.data.config,
              ...nextConfig,
              model: nextConfig.model
                ? normalizeModelId(nextConfig.model)
                : node.data.config.model,
            },
          },
        };
      }),
    }));
  },

  updateNodeMeasurements(nodeId, measurements) {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          style: {
            ...(node.style || {}),
            width: measurements.width,
            height: measurements.height,
          },
          data: {
            ...node.data,
            measurements: {
              ...node.data.measurements,
              ...measurements,
            },
          },
        };
      }),
    }));
  },

  setNodeStatus(nodeId, status, errorMessage = '') {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            status,
            metadata: {
              ...node.data.metadata,
              errorMessage,
            },
          },
        };
      }),
    }));
  },

  setNodeTokenInfo(nodeId, accumulatedTokens, tokenWarning) {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            metadata: {
              ...node.data.metadata,
              accumulatedTokens,
              tokenWarning,
            },
          },
        };
      }),
    }));
  },

  clearNodeOutput(nodeId) {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            text: '',
            rawText: '',
            toolPayload: [],
            status: 'draft',
            metadata: {
              ...node.data.metadata,
              errorMessage: '',
              isStale: false,
            },
          },
        };
      }),
    }));
  },

  appendNodeChunk(nodeId, chunk) {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        const rawText = `${node.data.rawText || ''}${chunk}`;
        const parsed = extractToolPayload(rawText);

        return {
          ...node,
          data: {
            ...node.data,
            rawText,
            text: parsed.text,
            toolPayload: parsed.toolPayload,
            status: 'generating',
            metadata: {
              ...node.data.metadata,
              errorMessage: '',
            },
          },
        };
      }),
    }));
  },

  setNodeStale(nodeId, isStale) {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            metadata: {
              ...node.data.metadata,
              isStale,
            },
          },
        };
      }),
    }));
  },

  markNodesStale(nodeIds) {
    const idSet = new Set(nodeIds);
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (!idSet.has(node.id)) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            metadata: {
              ...node.data.metadata,
              isStale: true,
            },
          },
        };
      }),
    }));
  },

  addFreeNode(type, position, text = '') {
    const node = createNode(type, position, text);

    set((state) => ({
      nodes: [...state.nodes, node],
    }));

    return node;
  },

  createSummaryNode(position) {
    return get().addFreeNode('summaryNote', position, 'Summary / Notes');
  },

  ensureAssistantChild(userNodeId) {
    const state = get();
    const childId = getChildNodeIds(userNodeId, state.nodes, state.edges)
      .map((nodeId) => state.nodes.find((node) => node.id === nodeId))
      .find((node) => node?.type === 'llmResponse')?.id;

    if (childId) {
      return childId;
    }

    const userNode = state.nodes.find((node) => node.id === userNodeId);
    if (!userNode) {
      return null;
    }

    const measurements = userNode.data.measurements || DEFAULT_NODE_SIZE.userInput;
    const llmNode = createNode(
      'llmResponse',
      {
        x: userNode.position.x + 24,
        y: userNode.position.y + measurements.height + 40,
      },
      ''
    );

    const edge = {
      id: createId('edge'),
      source: userNodeId,
      target: llmNode.id,
      type: 'custom',
      data: {},
    };

    set({
      nodes: [...state.nodes, llmNode],
      edges: [...state.edges, edge],
    });

    return llmNode.id;
  },

  createComposerFlow(message) {
    const state = get();
    const selectedNode = state.nodes.find((node) => node.selected);
    let sourceNode = null;

    if (selectedNode?.type === 'llmResponse') {
      sourceNode = selectedNode;
    } else {
      sourceNode = [...state.nodes].reverse().find((node) => node.type === 'llmResponse') || null;
    }

    const sourceMeasurements = sourceNode?.data?.measurements || DEFAULT_NODE_SIZE.llmResponse;
    const basePosition = sourceNode
      ? {
          x: sourceNode.position.x + 30,
          y: sourceNode.position.y + sourceMeasurements.height + 50,
        }
      : {
          x: 80 + state.nodes.length * 12,
          y: 80 + state.nodes.length * 12,
        };

    const userNode = createNode('userInput', basePosition, message);
    const assistantNode = createNode(
      'llmResponse',
      {
        x: basePosition.x + 20,
        y: basePosition.y + userNode.data.measurements.height + 40,
      },
      ''
    );

    const nextEdges = [...state.edges];
    if (sourceNode) {
      nextEdges.push({
        id: createId('edge'),
        source: sourceNode.id,
        target: userNode.id,
        type: 'custom',
        data: {},
      });
    }

    nextEdges.push({
      id: createId('edge'),
      source: userNode.id,
      target: assistantNode.id,
      type: 'custom',
      data: {},
    });

    set({
      composerMessage: '',
      nodes: [
        ...state.nodes.map((node) => ({ ...node, selected: false })),
        userNode,
        { ...assistantNode, selected: true },
      ],
      edges: nextEdges,
      ui: {
        ...state.ui,
        selectedNodeId: assistantNode.id,
      },
    });

    return {
      userNodeId: userNode.id,
      assistantNodeId: assistantNode.id,
    };
  },

  replicateNode(nodeId) {
    const state = get();
    const node = state.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return null;
    }

    const position = {
      x: node.position.x + 220,
      y: node.position.y + 20,
    };
    const nextNode = cloneNode(node, position);
    const parentId = getParentNodeId(node.id, state.nodes, state.edges);
    const nextEdges = [...state.edges];

    if (parentId && node.type !== 'summaryNote') {
      nextEdges.push({
        id: createId('edge'),
        source: parentId,
        target: nextNode.id,
        type: 'custom',
        data: {},
      });
    }

    set({
      nodes: [...state.nodes, nextNode],
      edges: nextEdges,
    });

    return nextNode.id;
  },

  queueGeneration(nodeIds) {
    set((state) => ({
      generation: {
        ...state.generation,
        isGenerating: nodeIds.length > 0,
        queue: nodeIds,
        activeNodeId: nodeIds[0] || null,
      },
    }));
  },

  shiftGenerationQueue() {
    set((state) => {
      const [, ...rest] = state.generation.queue;
      return {
        generation: {
          ...state.generation,
          queue: rest,
          activeNodeId: rest[0] || null,
          isGenerating: rest.length > 0,
        },
      };
    });
  },

  finishGeneration() {
    set((state) => ({
      generation: {
        ...state.generation,
        queue: [],
        activeNodeId: null,
        isGenerating: false,
      },
    }));
  },

  buildRegenerationTargets(userNodeId) {
    const state = get();
    const descendants = getDescendantNodeIds(userNodeId, state.nodes, state.edges);
    const llmNodeIds = descendants
      .map((nodeId) => state.nodes.find((node) => node.id === nodeId))
      .filter((node) => node?.type === 'llmResponse')
      .map((node) => node.id);

    const directAssistantId = get().ensureAssistantChild(userNodeId);

    if (llmNodeIds.length === 0 && directAssistantId) {
      return [directAssistantId];
    }

    const ordered = directAssistantId
      ? [directAssistantId, ...llmNodeIds.filter((nodeId) => nodeId !== directAssistantId)]
      : llmNodeIds;

    return ordered;
  },

  snapshotForPersistence() {
    const { sessions, activeSessionId, nodes, edges } = get();
    const session = sessions.find((item) => item.id === activeSessionId);

    return {
      session: touchSession(session),
      nodes: serializeNodes(nodes, activeSessionId),
      edges: serializeEdges(edges, activeSessionId),
    };
  },
}));

export {
  DEFAULT_MODEL,
  DEFAULT_NODE_SIZE,
};
