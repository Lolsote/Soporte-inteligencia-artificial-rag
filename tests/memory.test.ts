import test from 'node:test';
import assert from 'node:assert/strict';
import { appendConversationMessage, clearConversation, getConversation, getMemoryStats } from '../src/rag/memory.ts';

test('persists conversation history for a session and can clear it', async () => {
  const sessionId = 'test-session';
  clearConversation(sessionId);

  appendConversationMessage(sessionId, 'user', '¿Cómo verifico PostgreSQL?');
  appendConversationMessage(sessionId, 'assistant', 'Revisa el estado del servicio.');

  const history = getConversation(sessionId);
  assert.equal(history.length, 2);
  assert.equal(history[0].content, '¿Cómo verifico PostgreSQL?');

  const stats = getMemoryStats();
  assert.ok(stats.totalSessions >= 1);

  clearConversation(sessionId);
  assert.deepEqual(getConversation(sessionId), []);
});
