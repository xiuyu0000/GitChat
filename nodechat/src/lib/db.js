import Dexie from 'dexie';
import { normalizeNodes } from './models';

export const db = new Dexie('git-chat-research-db');

db.version(1).stores({
  sessions: 'id, title, updatedAt',
  nodes: 'id, sessionId, [sessionId+id], updatedAt',
  edges: 'id, sessionId, [sessionId+id], updatedAt',
});

export async function saveSessionSnapshot(session, nodes, edges) {
  if (!session?.id) {
    return;
  }

  const normalizedNodes = normalizeNodes(nodes);

  await db.transaction('rw', db.sessions, db.nodes, db.edges, async () => {
    await db.sessions.put(session);
    await db.nodes.where('sessionId').equals(session.id).delete();
    await db.edges.where('sessionId').equals(session.id).delete();
    await db.nodes.bulkPut(normalizedNodes);
    await db.edges.bulkPut(edges);
  });
}

export async function loadSessionSnapshot(sessionId) {
  const [session, storedNodes, edges] = await Promise.all([
    db.sessions.get(sessionId),
    db.nodes.where('sessionId').equals(sessionId).toArray(),
    db.edges.where('sessionId').equals(sessionId).toArray(),
  ]);

  const nodes = normalizeNodes(storedNodes);

  if (nodes.some((node, index) => node !== storedNodes[index])) {
    await db.transaction('rw', db.nodes, async () => {
      await db.nodes.where('sessionId').equals(sessionId).delete();
      await db.nodes.bulkPut(nodes);
    });
  }

  return { session, nodes, edges };
}

export async function listSessions() {
  return db.sessions.orderBy('updatedAt').reverse().toArray();
}

export async function deleteSessionSnapshot(sessionId) {
  await db.transaction('rw', db.sessions, db.nodes, db.edges, async () => {
    await db.sessions.delete(sessionId);
    await db.nodes.where('sessionId').equals(sessionId).delete();
    await db.edges.where('sessionId').equals(sessionId).delete();
  });
}

export async function replaceDatabase(payload) {
  const sessions = payload?.sessions || [];
  const nodes = normalizeNodes(payload?.nodes || []);
  const edges = payload?.edges || [];

  await db.transaction('rw', db.sessions, db.nodes, db.edges, async () => {
    await db.sessions.clear();
    await db.nodes.clear();
    await db.edges.clear();

    if (sessions.length) {
      await db.sessions.bulkPut(sessions);
    }

    if (nodes.length) {
      await db.nodes.bulkPut(nodes);
    }

    if (edges.length) {
      await db.edges.bulkPut(edges);
    }
  });
}

export async function exportDatabase() {
  const [sessions, nodes, edges] = await Promise.all([
    db.sessions.toArray(),
    db.nodes.toArray(),
    db.edges.toArray(),
  ]);

  return {
    sessions,
    nodes: normalizeNodes(nodes),
    edges,
  };
}
