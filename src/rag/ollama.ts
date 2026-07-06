import { config } from "../config.js";

let isOllamaOnline: boolean | null = null;
const modelStatusCache = new Map<string, boolean>();

/**
 * Checks if the Ollama server is reachable.
 */
export async function checkOllamaServer(): Promise<boolean> {
  if (isOllamaOnline !== null) return isOllamaOnline;
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1000);
    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(id);
    isOllamaOnline = response.ok;
    return isOllamaOnline;
  } catch {
    isOllamaOnline = false;
    return false;
  }
}

/**
 * Checks if a specific model is pulled and available in Ollama.
 */
export async function isModelAvailable(modelName: string): Promise<boolean> {
  if (modelStatusCache.has(modelName)) {
    return modelStatusCache.get(modelName)!;
  }
  
  const online = await checkOllamaServer();
  if (!online) {
    modelStatusCache.set(modelName, false);
    return false;
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1000);
    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(id);
    
    if (!response.ok) {
      modelStatusCache.set(modelName, false);
      return false;
    }
    
    const data = await response.json() as { models?: { name: string }[] };
    const models = data.models || [];
    
    // Normalize names (e.g. "llama3" and "llama3:latest" or "llama3:8b")
    const cleanName = modelName.split(":")[0].toLowerCase();
    const available = models.some(
      m => m.name.toLowerCase().startsWith(cleanName) || m.name.toLowerCase() === modelName.toLowerCase()
    );
    
    modelStatusCache.set(modelName, available);
    return available;
  } catch {
    modelStatusCache.set(modelName, false);
    return false;
  }
}
