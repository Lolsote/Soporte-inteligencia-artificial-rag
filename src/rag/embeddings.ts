import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { Embeddings } from "@langchain/core/embeddings";
import { config } from "../config.js";
import { isModelAvailable } from "./ollama.js";

/**
 * Cloud Gemini embeddings generator using Google Generative Language API.
 */
export class GeminiEmbeddings extends Embeddings {
  private apiKey: string;
  private modelName: string;

  constructor(fields: { apiKey: string; modelName?: string }) {
    super({});
    this.apiKey = fields.apiKey;
    this.modelName = fields.modelName || "gemini-embedding-2";
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:batchEmbedContents?key=${this.apiKey}`;
    
    // Split into chunks of maximum 100 documents per batch as recommended by Gemini API limits
    const chunkSize = 100;
    const results: number[][] = [];

    for (let i = 0; i < documents.length; i += chunkSize) {
      const chunk = documents.slice(i, i + chunkSize);
      const requests = chunk.map(doc => ({
        model: `models/${this.modelName}`,
        content: {
          parts: [{ text: doc }]
        }
      }));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ requests })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini Embeddings error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      results.push(...data.embeddings.map((emb: any) => emb.values));
    }

    return results;
  }

  async embedQuery(query: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:embedContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: `models/${this.modelName}`,
        content: {
          parts: [{ text: query }]
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Embedding Query error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.embedding.values;
  }
}

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
 * Resolves the embedding model dynamically. Falls back to MockEmbeddings if Ollama
 * or the specified embedding model is not available, allowing seamless transition when Ollama comes online.
 */
export async function getEmbeddings(): Promise<Embeddings> {
  if (config.gemini.apiKey) {
    if (!(instance instanceof GeminiEmbeddings)) {
      instance = new GeminiEmbeddings({ apiKey: config.gemini.apiKey });
    }
    return instance;
  }

  const available = await isModelAvailable(config.ollama.embeddingModel);
  if (available) {
    if (!(instance instanceof OllamaEmbeddings)) {
      instance = new OllamaEmbeddings({
        baseUrl: config.ollama.baseUrl,
        model: config.ollama.embeddingModel,
      });
    }
    return instance;
  }
  
  // Si está offline, retornamos MockEmbeddings pero NO lo guardamos en la cache global
  // para permitir la reconexión dinámica.
  return new MockEmbeddings();
}
