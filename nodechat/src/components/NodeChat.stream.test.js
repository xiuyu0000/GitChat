import React, { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NodeChat from './NodeChat';
import { db } from '../lib/db';
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
    return (
      <div data-testid={`user-${id}`}>
        <button type="button" onClick={() => data.onRegenerate(id)}>
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
        {`${id}:${data.text}${data.metadata?.isStale ? ' [stale]' : ''}`}
      </div>
    );
  };
});

jest.mock('./SummaryNode', () => {
  const React = require('react');

  return function MockSummaryNode({ id, data }) {
    return <div data-testid={`summary-${id}`}>{`${id}:${data.text}`}</div>;
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

describe('NodeChat streaming integration', () => {
  afterEach(async () => {
    cleanup();
    jest.restoreAllMocks();
    act(() => {
      resetStore();
    });
    await db.sessions.clear();
    await db.nodes.clear();
    await db.edges.clear();
  });

  test('delayed SSE abort preserves partial text and marks queued descendants stale', async () => {
    seedWorkspace();
    global.fetch = jest.fn().mockImplementation((_url, options = {}) => {
      let timeoutId;

      return Promise.resolve({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode('data: {"content":"Partial"}\n\n'));
            timeoutId = setTimeout(() => {
              controller.enqueue(encoder.encode('data: {"content":" answer"}\n\n'));
            }, 100);

            options.signal?.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              controller.error(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            });
          },
          cancel() {
            clearTimeout(timeoutId);
          },
        }),
      });
    });

    render(<NodeChat />);

    await act(async () => {
      fireEvent.click(screen.getByText('regen-u1'));
    });

    await waitFor(() => expect(screen.getByText('Stop')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/a1:Partial/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Stop'));
    });

    await waitFor(() => expect(useResearchStore.getState().generation.isGenerating).toBe(false));
    expect(useResearchStore.getState().nodes.find((node) => node.id === 'a1').data.text).toContain('Partial');
    expect(useResearchStore.getState().nodes.find((node) => node.id === 'a2').data.metadata.isStale).toBe(true);
    expect(screen.getByText(/a2:Child answer \[stale\]/)).toBeInTheDocument();
  });
});
