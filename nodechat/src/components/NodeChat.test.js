import React, { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NodeChat from './NodeChat';
import { db, saveSessionSnapshot } from '../lib/db';
import { useResearchStore } from '../store/researchStore';
import { streamCompletion } from '../services/LLMNetworkClient';

jest.mock('@xyflow/react', () => {
  const React = require('react');

  return {
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    ReactFlow: ({ nodes, nodeTypes, children }) => (
      <div data-testid="react-flow">
        {nodes.map((node) => {
          const Component = nodeTypes[node.type];
          return <Component key={node.id} id={node.id} data={node.data} selected={node.selected} />;
        })}
        {children}
      </div>
    ),
    SelectionMode: { Partial: 'partial' },
    useReactFlow: () => ({
      fitView: jest.fn(),
      screenToFlowPosition: ({ x, y }) => ({ x, y }),
    }),
  };
});

jest.mock('./UserInputNode', () => {
  const React = require('react');

  return function MockUserInputNode({ id, data }) {
    return (
      <div data-testid={`user-${id}`}>
        <div>{`user:${id}:${data.text}`}</div>
        <button
          type="button"
          onClick={() => {
            Promise.resolve(data.onRegenerate?.(id)).catch(() => {});
          }}
        >
          {`regen-${id}`}
        </button>
      </div>
    );
  };
});

jest.mock('./LLMResponseNode', () => {
  const React = require('react');

  return function MockLLMResponseNode({ id, data }) {
    return (
      <div data-testid={`assistant-${id}`}>
        {`assistant:${id}:${data.text}${data.metadata?.isStale ? ' [stale]' : ''}`}
      </div>
    );
  };
});

jest.mock('./SummaryNode', () => {
  const React = require('react');

  return function MockSummaryNode({ id, data }) {
    return <div data-testid={`summary-${id}`}>{`summary:${id}:${data.text}`}</div>;
  };
});

jest.mock('../services/LLMNetworkClient', () => ({
  streamCompletion: jest.fn(),
}));

jest.mock('../lib/db', () => {
  const actual = jest.requireActual('../lib/db');

  return {
    ...actual,
    saveSessionSnapshot: jest.fn(),
    exportDatabase: jest.fn(async () => actual.exportDatabase()),
  };
});

const INITIALIZE_WORKSPACE = useResearchStore.getState().initializeWorkspace;

function resetStore() {
  useResearchStore.setState({
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
    initializeWorkspace: INITIALIZE_WORKSPACE,
  });
}

function seedWorkspace(overrides = {}) {
  const session = {
    id: 'session-1',
    title: 'Test Session',
    createdAt: 1,
    updatedAt: 1,
  };

  act(() => {
    useResearchStore.setState({
      sessions: [session],
      activeSessionId: session.id,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      composerMessage: '',
      isHydrated: true,
      ui: {
        selectedNodeId: null,
        globalWarning: '',
      },
      generation: {
        isGenerating: false,
        activeNodeId: null,
        queue: [],
      },
      initializeWorkspace: jest.fn(),
      ...overrides,
    });
  });
}

describe('NodeChat orchestration', () => {
  let unhandledRejectionHandler;

  beforeAll(() => {
    unhandledRejectionHandler = (event) => {
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);
  });

  afterEach(async () => {
    cleanup();
    act(() => {
      resetStore();
    });
    await db.sessions.clear();
    await db.nodes.clear();
    await db.edges.clear();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    streamCompletion.mockReset();
    saveSessionSnapshot.mockReset();
  });

  afterAll(() => {
    window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
  });

  test('send creates a composer flow and streams the assistant response', async () => {
    seedWorkspace();
    streamCompletion.mockImplementation(async ({ onTextChunk, onDone }) => {
      onTextChunk('First');
      onTextChunk(' answer');
      onDone();
    });

    render(<NodeChat />);

    fireEvent.change(screen.getByPlaceholderText(/draft a new root question/i), {
      target: { value: 'Research topic' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    await waitFor(() => expect(streamCompletion).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/First answer/)).toBeInTheDocument());

    const state = useResearchStore.getState();
    expect(state.composerMessage).toBe('');
    expect(state.nodes).toHaveLength(2);
    expect(state.generation.isGenerating).toBe(false);
    expect(streamCompletion.mock.calls[0][0].messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))).toEqual([
      {
        role: 'user',
        content: 'Research topic',
      },
    ]);
  });

  test('stop aborts the active stream and marks queued descendants as stale', async () => {
    seedWorkspace({
      nodes: [
        {
          id: 'u1',
          type: 'userInput',
          position: { x: 0, y: 0 },
          selected: false,
          data: {
            text: 'Root prompt',
            rawText: 'Root prompt',
            createdAt: 1,
            config: {
              model: 'anthropic/claude-opus-4.6',
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
            measurements: { width: 320, height: 220 },
          },
        },
        {
          id: 'a1',
          type: 'llmResponse',
          position: { x: 0, y: 240 },
          selected: false,
          data: {
            text: 'Root answer',
            rawText: 'Root answer',
            createdAt: 2,
            config: {
              model: 'anthropic/claude-opus-4.6',
              enableWebSearch: false,
              enableThinking: false,
              systemPromptOverride: '',
            },
            toolPayload: [],
            metadata: {
              accumulatedTokens: 20,
              isStale: false,
              errorMessage: '',
              tokenWarning: false,
            },
            status: 'done',
            measurements: { width: 380, height: 240 },
          },
        },
        {
          id: 'u2',
          type: 'userInput',
          position: { x: 40, y: 520 },
          selected: false,
          data: {
            text: 'Child prompt',
            rawText: 'Child prompt',
            createdAt: 3,
            config: {
              model: 'anthropic/claude-opus-4.6',
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
            measurements: { width: 320, height: 220 },
          },
        },
        {
          id: 'a2',
          type: 'llmResponse',
          position: { x: 40, y: 760 },
          selected: false,
          data: {
            text: 'Child answer',
            rawText: 'Child answer',
            createdAt: 4,
            config: {
              model: 'anthropic/claude-opus-4.6',
              enableWebSearch: false,
              enableThinking: false,
              systemPromptOverride: '',
            },
            toolPayload: [],
            metadata: {
              accumulatedTokens: 20,
              isStale: false,
              errorMessage: '',
              tokenWarning: false,
            },
            status: 'done',
            measurements: { width: 380, height: 240 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'u1', target: 'a1', type: 'custom', data: {} },
        { id: 'e2', source: 'a1', target: 'u2', type: 'custom', data: {} },
        { id: 'e3', source: 'u2', target: 'a2', type: 'custom', data: {} },
      ],
    });

    streamCompletion.mockImplementation(({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      });
    }));

    render(<NodeChat />);

    await act(async () => {
      fireEvent.click(screen.getByText('regen-u1'));
    });

    await waitFor(() => expect(screen.getByText('Stop')).toBeInTheDocument());
    expect(useResearchStore.getState().generation.queue).toEqual(['a1', 'a2']);

    await act(async () => {
      fireEvent.click(screen.getByText('Stop'));
    });

    await waitFor(() => expect(useResearchStore.getState().generation.isGenerating).toBe(false));
    expect(useResearchStore.getState().nodes.find((node) => node.id === 'a2').data.metadata.isStale).toBe(true);
    expect(screen.getByText(/assistant:a2:Child answer \[stale\]/)).toBeInTheDocument();
  });

  test('token threshold blocks generation and surfaces the warning without starting a request', async () => {
    seedWorkspace({
      nodes: [
        {
          id: 'u1',
          type: 'userInput',
          position: { x: 0, y: 0 },
          selected: false,
          data: {
            text: 'x'.repeat(9600),
            rawText: 'x'.repeat(9600),
            createdAt: 1,
            config: {
              model: 'anthropic/claude-opus-4.6',
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
            measurements: { width: 320, height: 220 },
          },
        },
        {
          id: 'a1',
          type: 'llmResponse',
          position: { x: 0, y: 240 },
          selected: false,
          data: {
            text: '',
            rawText: '',
            createdAt: 2,
            config: {
              model: 'anthropic/claude-opus-4.6',
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
            measurements: { width: 380, height: 240 },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'u1', target: 'a1', type: 'custom', data: {} }],
    });

    render(<NodeChat />);

    await act(async () => {
      fireEvent.click(screen.getByText('regen-u1'));
    });

    await waitFor(() => expect(screen.getByText(/Context usage is /i)).toBeInTheDocument());
    expect(useResearchStore.getState().ui.globalWarning).toContain('9600/16000');
    expect(streamCompletion).not.toHaveBeenCalled();
    expect(useResearchStore.getState().generation.isGenerating).toBe(false);
  });
});
