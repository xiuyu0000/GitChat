import React, { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import NodeChat from './NodeChat';
import { db, saveSessionSnapshot } from '../lib/db';
import { useResearchStore } from '../store/researchStore';

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
    return <div data-testid={`user-${id}`}>{`user:${id}:${data.text}`}</div>;
  };
});

jest.mock('./LLMResponseNode', () => {
  const React = require('react');

  return function MockLLMResponseNode({ id, data }) {
    return <div data-testid={`assistant-${id}`}>{`assistant:${id}:${data.text}`}</div>;
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

function seedWorkspace() {
  act(() => {
    useResearchStore.setState({
      sessions: [{ id: 'session-1', title: 'Test Session', createdAt: 1, updatedAt: 1 }],
      activeSessionId: 'session-1',
      nodes: [
        {
          id: 'u1',
          type: 'userInput',
          position: { x: 0, y: 0 },
          selected: false,
          data: {
            text: 'Initial',
            rawText: 'Initial',
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
      ],
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
    });
  });
}

describe('NodeChat persistence timing', () => {
  afterEach(async () => {
    cleanup();
    act(() => {
      resetStore();
    });
    jest.useRealTimers();
    await db.sessions.clear();
    await db.nodes.clear();
    await db.edges.clear();
    jest.restoreAllMocks();
    saveSessionSnapshot.mockReset();
  });

  test('debounced persistence saves the latest snapshot once after 500ms', async () => {
    jest.useFakeTimers();
    seedWorkspace();
    render(<NodeChat />);

    await act(async () => {
      useResearchStore.getState().updateNodeText('u1', 'Draft one');
      useResearchStore.getState().updateNodeText('u1', 'Draft two');
    });

    expect(saveSessionSnapshot).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(499);
    });
    expect(saveSessionSnapshot).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(saveSessionSnapshot).toHaveBeenCalledTimes(1);
    expect(saveSessionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1' }),
      [
        expect.objectContaining({
          id: 'u1',
          sessionId: 'session-1',
          data: expect.objectContaining({
            text: 'Draft two',
          }),
        }),
      ],
      []
    );
  });
});
