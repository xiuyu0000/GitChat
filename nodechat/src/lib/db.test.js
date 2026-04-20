import {
  db,
  exportDatabase,
  loadSessionSnapshot,
  replaceDatabase,
  saveSessionSnapshot,
} from './db';

describe('db persistence helpers', () => {
  afterEach(async () => {
    await db.sessions.clear();
    await db.nodes.clear();
    await db.edges.clear();
  });

  test('saveSessionSnapshot persists and reloads a single session snapshot', async () => {
    await saveSessionSnapshot(
      { id: 'session-a', title: 'Session A', createdAt: 1, updatedAt: 2 },
      [
        {
          id: 'u1',
          sessionId: 'session-a',
          type: 'userInput',
          position: { x: 10, y: 20 },
          data: { text: 'Root A', config: { model: 'anthropic/claude-opus-4.6' } },
          updatedAt: 2,
        },
      ],
      [{ id: 'e1', sessionId: 'session-a', source: 'u1', target: 'a1', updatedAt: 2 }]
    );

    const snapshot = await loadSessionSnapshot('session-a');

    expect(snapshot.session).toEqual(expect.objectContaining({ id: 'session-a', title: 'Session A' }));
    expect(snapshot.nodes).toEqual([expect.objectContaining({ id: 'u1', sessionId: 'session-a' })]);
    expect(snapshot.edges).toEqual([expect.objectContaining({ id: 'e1', sessionId: 'session-a' })]);
  });

  test('saveSessionSnapshot overwrites one session without touching another session', async () => {
    await saveSessionSnapshot(
      { id: 'session-a', title: 'Session A', createdAt: 1, updatedAt: 2 },
      [{ id: 'u1', sessionId: 'session-a', type: 'userInput', position: { x: 0, y: 0 }, data: { text: 'A1', config: { model: 'anthropic/claude-opus-4.6' } }, updatedAt: 2 }],
      []
    );
    await saveSessionSnapshot(
      { id: 'session-b', title: 'Session B', createdAt: 1, updatedAt: 2 },
      [{ id: 'u2', sessionId: 'session-b', type: 'userInput', position: { x: 0, y: 0 }, data: { text: 'B1', config: { model: 'openai/gpt-5.4' } }, updatedAt: 2 }],
      []
    );

    await saveSessionSnapshot(
      { id: 'session-a', title: 'Session A', createdAt: 1, updatedAt: 3 },
      [{ id: 'u1b', sessionId: 'session-a', type: 'userInput', position: { x: 5, y: 5 }, data: { text: 'A2', config: { model: 'anthropic/claude-opus-4.6' } }, updatedAt: 3 }],
      []
    );

    const sessionA = await loadSessionSnapshot('session-a');
    const sessionB = await loadSessionSnapshot('session-b');

    expect(sessionA.nodes).toEqual([expect.objectContaining({ id: 'u1b', sessionId: 'session-a' })]);
    expect(sessionB.nodes).toEqual([expect.objectContaining({ id: 'u2', sessionId: 'session-b' })]);
  });

  test('replaceDatabase clears stale data and exports the imported payload', async () => {
    await saveSessionSnapshot(
      { id: 'legacy', title: 'Legacy Session', createdAt: 1, updatedAt: 1 },
      [{ id: 'legacy-node', sessionId: 'legacy', type: 'userInput', position: { x: 0, y: 0 }, data: { text: 'old' }, updatedAt: 1 }],
      []
    );

    await replaceDatabase({
      sessions: [{ id: 'session-c', title: 'Imported Session', createdAt: 10, updatedAt: 11 }],
      nodes: [
        {
          id: 'u3',
          sessionId: 'session-c',
          type: 'userInput',
          position: { x: 30, y: 40 },
          data: { text: 'Imported root', config: { model: 'openai/gpt-5.4' } },
          updatedAt: 11,
        },
      ],
      edges: [{ id: 'e3', sessionId: 'session-c', source: 'u3', target: 'a3', updatedAt: 11 }],
    });

    const exported = await exportDatabase();

    expect(exported.sessions).toEqual([expect.objectContaining({ id: 'session-c' })]);
    expect(exported.nodes).toEqual([expect.objectContaining({ id: 'u3', sessionId: 'session-c' })]);
    expect(exported.edges).toEqual([expect.objectContaining({ id: 'e3', sessionId: 'session-c' })]);
    expect(exported.sessions.find((session) => session.id === 'legacy')).toBeUndefined();
  });

  test('loadSessionSnapshot normalizes legacy model ids and writes back sanitized data', async () => {
    await db.sessions.put({ id: 'legacy-session', title: 'Legacy Session', createdAt: 1, updatedAt: 1 });
    await db.nodes.put({
      id: 'legacy-node',
      sessionId: 'legacy-session',
      type: 'userInput',
      position: { x: 0, y: 0 },
      data: {
        text: 'old',
        config: {
          model: 'openai/gpt-4.1',
        },
      },
      updatedAt: 1,
    });

    const snapshot = await loadSessionSnapshot('legacy-session');
    const persistedNode = await db.nodes.get('legacy-node');

    expect(snapshot.nodes[0].data.config.model).toBe('openai/gpt-5.4');
    expect(persistedNode.data.config.model).toBe('openai/gpt-5.4');
  });
});
