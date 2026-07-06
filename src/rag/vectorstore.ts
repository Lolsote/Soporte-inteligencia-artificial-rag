import { getEmbeddings } from "./embeddings.js";
import { config } from "../config.js";
import type { Embeddings } from "@langchain/core/embeddings";
import { Document } from "@langchain/core/documents";

interface VectorEntry {
  document: Document;
  vector: number[];
}

export class LocalMemoryVectorStore {
  private entries: VectorEntry[] = [];
  private readonly embeddings: Embeddings;

  constructor(embeddings: Embeddings) {
    this.embeddings = embeddings;
  }

  async addDocuments(docs: Document[]) {
    const vectors = await this.embeddings.embedDocuments(docs.map((doc) => doc.pageContent));
    this.entries.push(...docs.map((doc, index) => ({ document: doc, vector: vectors[index] })));
  }

  async similaritySearchWithScore(query: string, k = 5) {
    if (this.entries.length === 0) {
      return [];
    }

    const queryVector = await this.embeddings.embedQuery(query);
    const scored = this.entries
      .map((entry) => ({
        document: entry.document,
        score: this.cosineSimilarity(queryVector, entry.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return scored.map((item) => [item.document, item.score] as [Document, number]);
  }

  private cosineSimilarity(a: number[], b: number[]) {
    const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
    const normA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
    const normB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
  }

  async count() {
    return this.entries.length;
  }

  clear() {
    this.entries = [];
  }
}

let store: LocalMemoryVectorStore | null = null;
let persistentAvailable = true;

export async function getVectorStore(): Promise<LocalMemoryVectorStore> {
  if (store) return store;

  const embeddings = await getEmbeddings();

  if (persistentAvailable) {
    try {
      const localStore = new LocalMemoryVectorStore(embeddings);
      store = localStore;
      return store;
    } catch {
      persistentAvailable = false;
      console.warn("No se pudo inicializar el vector store local, usando memoria en RAM.");
    }
  }

  store = new LocalMemoryVectorStore(await getEmbeddings());
  return store;
}

export async function addDocuments(docs: Document[]) {
  const vs = await getVectorStore();
  await vs.addDocuments(docs);
}

export async function similaritySearch(query: string, k = 5) {
  const vs = await getVectorStore();
  return vs.similaritySearchWithScore(query, k);
}

export async function collectionSize(): Promise<number> {
  return (await getVectorStore()).count();
}

export async function deleteCollection(): Promise<void> {
  const vs = await getVectorStore();
  vs.clear();
  store = null;
}

export function getVectorStoreType(): string {
  return "En Memoria (Offline)";
}

