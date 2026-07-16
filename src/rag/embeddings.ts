import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { Embeddings } from "@langchain/core/embeddings";
import { config } from "../config.js";
import { isModelAvailable } from "./ollama.js";

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

      let retries = 3;
      let delay = 1000;
      let success = false;
      while (retries > 0) {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ requests })
          });

          if (!response.ok) {
            const errText = await response.text();
            if ((response.status === 503 || response.status === 429) && retries > 1) {
              await new Promise(resolve => setTimeout(resolve, delay));
              retries--;
              delay *= 2;
              continue;
            }
            throw new Error(`Gemini Embeddings error: ${response.status} - ${errText}`);
          }

          const data = await response.json();
          results.push(...data.embeddings.map((emb: any) => emb.values));
          success = true;
          break;
        } catch (err) {
          if (retries === 1) throw err;
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
          delay *= 2;
        }
      }
      if (!success) {
        throw new Error("Failed to generate embeddings after multiple retries");
      }
    }

    return results;
  }

  async embedQuery(query: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:embedContent?key=${this.apiKey}`;
    
    let retries = 3;
    let delay = 1000;
    while (retries > 0) {
      try {
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
          if ((response.status === 503 || response.status === 429) && retries > 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
            retries--;
            delay *= 2;
            continue;
          }
          throw new Error(`Gemini Embedding Query error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        return data.embedding.values;
      } catch (err) {
        if (retries === 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        retries--;
        delay *= 2;
      }
    }
    throw new Error("Failed to generate query embedding after multiple retries");
  }
}

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
        hash |= 0; 
      }
      const idx = Math.abs(hash) % dimensions;
      vector[idx] += 1;
    }

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
  
  return new MockEmbeddings();
}
