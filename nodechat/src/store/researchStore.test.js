import { db } from '../lib/db';
import { useResearchStore } from './researchStore';

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
  });
}

describe('researchStore', () => {
  afterEach(async () => {
    resetStore();
    await db.sessions.clear();
    await db.nodes.clear();
    await db.edges.clear();
    jest.restoreAllMocks();
  });

  test('initializeWorkspace creates a default session when storage is empty', async () => {
    await useResearchStore.getState().initializeWorkspace();

    const state = useResearchStore.getState();
    expect(state.isHydrated).toBe(true);
    expect(state.sessions).toHaveLength(1);
    expect(state.activeSessionId).toBe(state.sessions[0].id);

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
  });

  test('createComposerFlow creates linked user/assistant nodes and clears composer text', () => {
    useResearchStore.setState({
      sessions: [{ id: 'session-1', title: 'Test', updatedAt: 1, createdAt: 1 }],
      activeSessionId: 'session-1',
      composerMessage: 'draft',
    });

    const flow = useResearchStore.getState().createComposerFlow('Plan the branch');
    const state = useResearchStore.getState();
    const userNode = state.nodes.find((node) => node.id === flow.userNodeId);
    const assistantNode = state.nodes.find((node) => node.id === flow.assistantNodeId);

    expect(state.composerMessage).toBe('');
    expect(userNode.data.text).toBe('Plan the branch');
    expect(assistantNode.type).toBe('llmResponse');
    expect(state.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: flow.userNodeId, target: flow.assistantNodeId }),
      ])
    );
  });

  test('buildRegenerationTargets returns direct and descendant assistant nodes in order', () => {
    useResearchStore.setState({
      sessions: [{ id: 'session-1', title: 'Test', updatedAt: 1, createdAt: 1 }],
      activeSessionId: 'session-1',
      nodes: [
        {
          id: 'u1',
          type: 'userInput',
          position: { x: 0, y: 0 },
          data: {
            text: 'Q1',
            createdAt: 1,
            config: {},
            toolPayload: [],
            metadata: {},
            status: 'draft',
            measurements: { width: 320, height: 220 },
          },
        },
        {
          id: 'a1',
          type: 'llmResponse',
          position: { x: 0, y: 0 },
          data: {
            text: 'A1',
            createdAt: 2,
            config: {},
            toolPayload: [],
            metadata: {},
            status: 'done',
            measurements: { width: 380, height: 240 },
          },
        },
        {
          id: 'u2',
          type: 'userInput',
          position: { x: 0, y: 0 },
          data: {
            text: 'Q2',
            createdAt: 3,
            config: {},
            toolPayload: [],
            metadata: {},
            status: 'draft',
            measurements: { width: 320, height: 220 },
          },
        },
        {
          id: 'a2',
          type: 'llmResponse',
          position: { x: 0, y: 0 },
          data: {
            text: 'A2',
            createdAt: 4,
            config: {},
            toolPayload: [],
            metadata: {},
            status: 'done',
            measurements: { width: 380, height: 240 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'u1', target: 'a1' },
        { id: 'e2', source: 'a1', target: 'u2' },
        { id: 'e3', source: 'u2', target: 'a2' },
      ],
    });

    expect(useResearchStore.getState().buildRegenerationTargets('u1')).toEqual(['a1', 'a2']);
  });

  test('markNodesStale and updateNodeConfig update the targeted node only', () => {
    useResearchStore.setState({
      nodes: [
        {
          id: 'u1',
          type: 'userInput',
          position: { x: 0, y: 0 },
          data: {
            text: 'Root',
            createdAt: 1,
            config: { model: 'anthropic/claude-opus-4-1', enableThinking: false },
            toolPayload: [],
            metadata: { isStale: false },
            status: 'draft',
            measurements: { width: 320, height: 220 },
          },
        },
        {
          id: 'a1',
          type: 'llmResponse',
          position: { x: 0, y: 0 },
          data: {
            text: 'Answer',
            createdAt: 2,
            config: {},
            toolPayload: [],
            metadata: { isStale: false },
            status: 'done',
            measurements: { width: 380, height: 240 },
          },
        },
      ],
    });

    useResearchStore.getState().updateNodeConfig('u1', { enableThinking: true, model: 'openai/gpt-5.4' });
    useResearchStore.getState().markNodesStale(['a1']);

    const state = useResearchStore.getState();
    expect(state.nodes.find((node) => node.id === 'u1').data.config).toEqual(
      expect.objectContaining({
        enableThinking: true,
        model: 'openai/gpt-5.4',
      })
    );
    expect(state.nodes.find((node) => node.id === 'a1').data.metadata.isStale).toBe(true);
  });

  test('initializeWorkspace migrates legacy model ids during hydration', async () => {
    await db.sessions.put({ id: 'session-legacy', title: 'Legacy', createdAt: 1, updatedAt: 2 });
    await db.nodes.put({
      id: 'u-legacy',
      sessionId: 'session-legacy',
      type: 'userInput',
      position: { x: 0, y: 0 },
      data: {
        text: 'Legacy root',
        createdAt: 1,
        config: { model: 'anthropic/claude-opus-4-1', enableThinking: false, enableWebSearch: false, systemPromptOverride: '' },
        toolPayload: [],
        metadata: {},
        status: 'draft',
        measurements: { width: 320, height: 220 },
      },
      updatedAt: 2,
    });

    await useResearchStore.getState().initializeWorkspace();

    const hydratedNode = useResearchStore.getState().nodes.find((node) => node.id === 'u-legacy');
    expect(hydratedNode.data.config.model).toBe('anthropic/claude-opus-4.6');
  });

  test('importProject replaces persisted data and hydrates the first session', async () => {
    await useResearchStore.getState().importProject({
      sessions: [{ id: 'session-a', title: 'Imported', createdAt: 1, updatedAt: 2 }],
      nodes: [
        {
          id: 'u1',
          sessionId: 'session-a',
          type: 'userInput',
          position: { x: 10, y: 20 },
          data: {
            text: 'Imported root',
            createdAt: 1,
            config: {},
            toolPayload: [],
            metadata: {},
            status: 'draft',
            measurements: { width: 320, height: 220 },
          },
        },
      ],
      edges: [],
    });

    const state = useResearchStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.activeSessionId).toBe('session-a');
    expect(state.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'u1', sessionId: 'session-a' })])
    );
  });
});
