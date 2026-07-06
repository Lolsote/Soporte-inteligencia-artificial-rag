import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalMemoryVectorStore } from '../src/rag/vectorstore.ts';
import { MockEmbeddings } from '../src/rag/embeddings.ts';
import { Document } from '@langchain/core/documents';

test('retrieves relevant documents from the local vector store', async () => {
  const store = new LocalMemoryVectorStore(new MockEmbeddings());
  await store.addDocuments([
    new Document({ pageContent: 'PostgreSQL está en el puerto 5432 y el servicio se llama postgresql-15', metadata: { source: 'db.md' } }),
    new Document({ pageContent: 'El API Gateway escucha en el puerto 443', metadata: { source: 'api.md' } }),
  ]);

  const results = await store.similaritySearchWithScore('¿Cómo verifico PostgreSQL?', 3);
  assert.ok(results.length > 0);
  assert.match(results[0][0].pageContent, /PostgreSQL/i);
});
