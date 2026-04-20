const MAX_CONTEXT_TOKENS = 16000;
const TOKEN_WARNING_RATIO = 0.6;

export function estimateTokens(text = '') {
  return Array.from(text).reduce((total, char) => {
    if (/[\u4e00-\u9fff]/.test(char)) {
      return total + 2;
    }

    if (/\s/.test(char)) {
      return total;
    }

    return total + 1;
  }, 0);
}

export function buildGraphMaps(nodes = [], edges = []) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map();
  const outgoing = new Map();

  nodes.forEach((node) => {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  });

  edges.forEach((edge) => {
    if (!incoming.has(edge.target)) {
      incoming.set(edge.target, []);
    }

    if (!outgoing.has(edge.source)) {
      outgoing.set(edge.source, []);
    }

    incoming.get(edge.target).push(edge.source);
    outgoing.get(edge.source).push(edge.target);
  });

  return { nodeMap, incoming, outgoing };
}

function sortNodeIds(ids, nodeMap) {
  return [...ids].sort((leftId, rightId) => {
    const leftNode = nodeMap.get(leftId);
    const rightNode = nodeMap.get(rightId);
    const leftTime = leftNode?.data?.createdAt || 0;
    const rightTime = rightNode?.data?.createdAt || 0;

    return leftTime - rightTime;
  });
}

export function getAncestorChain(targetNodeId, nodes = [], edges = []) {
  const { nodeMap, incoming } = buildGraphMaps(nodes, edges);
  const visited = new Set();
  const ordered = [];

  function visit(nodeId) {
    if (!nodeId || visited.has(nodeId)) {
      return;
    }

    const node = nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    visited.add(nodeId);
    const parents = sortNodeIds(incoming.get(nodeId) || [], nodeMap);
    parents.forEach(visit);
    ordered.push(node);
  }

  visit(targetNodeId);
  return ordered;
}

export function getDescendantNodeIds(sourceNodeId, nodes = [], edges = []) {
  const { nodeMap, outgoing } = buildGraphMaps(nodes, edges);
  const visited = new Set();
  const ordered = [];

  function walk(nodeId) {
    const childIds = sortNodeIds(outgoing.get(nodeId) || [], nodeMap);
    childIds.forEach((childId) => {
      if (visited.has(childId)) {
        return;
      }

      visited.add(childId);
      ordered.push(childId);
      walk(childId);
    });
  }

  walk(sourceNodeId);
  return ordered;
}

export function getParentNodeId(targetNodeId, nodes = [], edges = []) {
  const { nodeMap, incoming } = buildGraphMaps(nodes, edges);
  const parents = sortNodeIds(incoming.get(targetNodeId) || [], nodeMap);

  return parents[0] || null;
}

export function getChildNodeIds(sourceNodeId, nodes = [], edges = []) {
  const { nodeMap, outgoing } = buildGraphMaps(nodes, edges);
  return sortNodeIds(outgoing.get(sourceNodeId) || [], nodeMap);
}

export function buildMessages(targetNodeId, nodes = [], edges = []) {
  return getAncestorChain(targetNodeId, nodes, edges)
    .filter((node) => node.type !== 'summaryNote')
    .map((node) => ({
      id: node.id,
      role: node.type === 'llmResponse' ? 'assistant' : 'user',
      content: node.data?.text || '',
    }))
    .filter((message) => message.content.trim() !== '');
}

export function estimateBranchTokens(targetNodeId, nodes = [], edges = []) {
  const messages = buildMessages(targetNodeId, nodes, edges);

  return messages.reduce((total, message) => total + estimateTokens(message.content), 0);
}

export function shouldWarnForTokens(targetNodeId, nodes = [], edges = [], maxTokens = MAX_CONTEXT_TOKENS) {
  const usedTokens = estimateBranchTokens(targetNodeId, nodes, edges);

  return {
    usedTokens,
    maxTokens,
    threshold: Math.floor(maxTokens * TOKEN_WARNING_RATIO),
    shouldWarn: usedTokens >= Math.floor(maxTokens * TOKEN_WARNING_RATIO),
  };
}

export function isValidDagConnection(connection, nodes = [], edges = []) {
  const { source, target } = connection || {};

  if (!source || !target || source === target) {
    return false;
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const sourceNode = nodeMap.get(source);
  const targetNode = nodeMap.get(target);

  if (!sourceNode || !targetNode) {
    return false;
  }

  if (sourceNode.type === 'summaryNote' || targetNode.type === 'summaryNote') {
    return false;
  }

  const outgoing = new Map();
  nodes.forEach((node) => outgoing.set(node.id, []));
  edges.forEach((edge) => {
    if (!outgoing.has(edge.source)) {
      outgoing.set(edge.source, []);
    }
    outgoing.get(edge.source).push(edge.target);
  });

  const stack = [target];
  const visited = new Set();

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === source) {
      return false;
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    (outgoing.get(current) || []).forEach((next) => stack.push(next));
  }

  return true;
}

export function buildMarkdownForNode(targetNodeId, nodes = [], edges = []) {
  return buildMessages(targetNodeId, nodes, edges)
    .map((message) => {
      const heading = message.role === 'user' ? '## User' : '## Assistant';
      return `${heading}\n\n${message.content}`.trim();
    })
    .join('\n\n');
}

export function createProjectExportPayload({ sessions, nodes, edges }) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    nodes,
    edges,
  };
}

export {
  MAX_CONTEXT_TOKENS,
  TOKEN_WARNING_RATIO,
};
