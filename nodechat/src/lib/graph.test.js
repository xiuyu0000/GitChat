import {
  createProjectExportPayload,
  buildMarkdownForNode,
  buildMessages,
  estimateBranchTokens,
  getAncestorChain,
  getDescendantNodeIds,
  isValidDagConnection,
  shouldWarnForTokens,
} from './graph';

function createNode(id, type, text) {
  return {
    id,
    type,
    data: {
      text,
      createdAt: Number(id.replace(/\D/g, '')) || 0,
    },
  };
}

describe('graph helpers', () => {
  const nodes = [
    createNode('u1', 'userInput', 'Root question'),
    createNode('a2', 'llmResponse', 'First answer'),
    createNode('u3', 'userInput', 'Follow-up'),
    createNode('a4', 'llmResponse', 'Detailed answer'),
    createNode('n5', 'summaryNote', 'This note is private'),
  ];

  const edges = [
    { id: 'e1', source: 'u1', target: 'a2' },
    { id: 'e2', source: 'a2', target: 'u3' },
    { id: 'e3', source: 'u3', target: 'a4' },
  ];

  test('builds messages from the ancestor chain and excludes summary notes', () => {
    expect(buildMessages('a4', nodes, edges)).toEqual([
      { id: 'u1', role: 'user', content: 'Root question' },
      { id: 'a2', role: 'assistant', content: 'First answer' },
      { id: 'u3', role: 'user', content: 'Follow-up' },
      { id: 'a4', role: 'assistant', content: 'Detailed answer' },
    ]);
  });

  test('returns ancestor and descendant traversal in creation order', () => {
    expect(getAncestorChain('a4', nodes, edges).map((node) => node.id)).toEqual(['u1', 'a2', 'u3', 'a4']);
    expect(getDescendantNodeIds('u1', nodes, edges)).toEqual(['a2', 'u3', 'a4']);
  });

  test('blocks cyclic connections and note links', () => {
    expect(isValidDagConnection({ source: 'a4', target: 'u1' }, nodes, edges)).toBe(false);
    expect(isValidDagConnection({ source: 'u1', target: 'n5' }, nodes, edges)).toBe(false);
    expect(isValidDagConnection({ source: 'a4', target: 'n5' }, nodes, edges)).toBe(false);
    expect(isValidDagConnection({ source: 'a4', target: 'u3' }, nodes, edges)).toBe(false);
  });

  test('creates export markdown in a linear conversation format', () => {
    expect(buildMarkdownForNode('a4', nodes, edges)).toContain('## User');
    expect(buildMarkdownForNode('a4', nodes, edges)).toContain('## Assistant');
    expect(buildMarkdownForNode('a4', nodes, edges)).toContain('Detailed answer');
  });

  test('warns when branch tokens cross the threshold', () => {
    const longNodes = [
      createNode('u1', 'userInput', '中'.repeat(5000)),
      createNode('a2', 'llmResponse', 'A short answer'),
    ];
    const longEdges = [{ id: 'e1', source: 'u1', target: 'a2' }];

    expect(estimateBranchTokens('a2', longNodes, longEdges)).toBeGreaterThan(6000);
    expect(shouldWarnForTokens('a2', longNodes, longEdges).shouldWarn).toBe(true);
  });

  test('does not warn when branch tokens stay below threshold and exports payload metadata', () => {
    const warning = shouldWarnForTokens('a2', nodes, edges, 100);
    const payload = createProjectExportPayload({ sessions: [{ id: 's1' }], nodes, edges });

    expect(warning).toEqual(
      expect.objectContaining({
        usedTokens: expect.any(Number),
        threshold: 60,
        maxTokens: 100,
        shouldWarn: false,
      })
    );
    expect(payload).toEqual(
      expect.objectContaining({
        version: 1,
        sessions: [{ id: 's1' }],
        nodes,
        edges,
        exportedAt: expect.any(String),
      })
    );
  });

  test('returns empty markdown for missing or empty nodes', () => {
    expect(buildMarkdownForNode('missing', nodes, edges)).toBe('');
    expect(
      buildMessages(
        'a4',
        [
          createNode('u1', 'userInput', '   '),
          createNode('a2', 'llmResponse', '\n'),
        ],
        [{ id: 'e1', source: 'u1', target: 'a2' }]
      )
    ).toEqual([]);
  });
});
