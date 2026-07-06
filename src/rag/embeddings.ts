import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { Embeddings } from "@langchain/core/embeddings";
import { config } from "../config.js";
import { isModelAvailable } from "./ollama.js";

/**
 * A local mock embeddings generator based on term frequency.
 * Allows RAG similarity search to function offline without a neural model.
 */
export class MockEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  private textToVector(text: string, dimensions = 768): number[] {
    const vector = new Array(dimensions).fill(0);
    const cleanText = text.toLowerCase().replace(/[^a-z0-9áéíóúñ]/g, " ");
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    
    if (words.length === 0) return vector;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = (hash << 5) - hash + word.charCodeAt(j);
        hash |= 0; // 32-bit integer conversion
      }
      const idx = Math.abs(hash) % dimensions;
      vector[idx] += 1;
    }

    // L2 normalization of the vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        vector[i] /= magnitude;
      }
    }
    return vector;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return documents.map(doc => this.textToVector(doc));
  }

  async embedQuery(query: string): Promise<number[]> {
    return this.textToVector(query);
  }
}

let instance: Embeddings | null = null;

/**
 * Resolves the embedding model. Falls back to MockEmbeddings if Ollama
 * or the specified embedding model is not available.
 */
export async function getEmbeddings(): Promise<Embeddings> {
  if (!instance) {
    const available = await isModelAvailable(config.ollama.embeddingModel);
    if (available) {
      instance = new OllamaEmbeddings({
        baseUrl: config.ollama.baseUrl,
        model: config.ollama.embeddingModel,
      });
    } else {
      console.warn(
        `\n[SoporteIA] ⚠️  Ollama o el modelo de embeddings '${config.ollama.embeddingModel}' no están disponibles.`
      );
      console.warn(`[SoporteIA] Usando MockEmbeddings locales (Modo Demostración Offline)\n`);
      instance = new MockEmbeddings();
    }
  }
  return instance;
}
