import { config } from "../config.js";

let lastCheckTime = 0;
let isOllamaOnlineCached = false;
const modelCache = new Map<string, { available: boolean; timestamp: number }>();

/**
 * Checks if the Ollama server is reachable. Re-checks every 10 seconds.
 */
export async function checkOllamaServer(): Promise<boolean> {
  const now = Date.now();
  if (now - lastCheckTime < 10000) {
    return isOllamaOnlineCached;
  }
  
  lastCheckTime = now;
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(id);
    isOllamaOnlineCached = response.ok;
    return isOllamaOnlineCached;
  } catch {
    isOllamaOnlineCached = false;
    return false;
  }
}

/**
 * Checks if a specific model is pulled and available in Ollama. Re-checks every 10 seconds.
 */
export async function isModelAvailable(modelName: string): Promise<boolean> {
  const now = Date.now();
  const cached = modelCache.get(modelName);
  if (cached && now - cached.timestamp < 10000) {
    return cached.available;
  }
  
  const online = await checkOllamaServer();
  if (!online) {
    modelCache.set(modelName, { available: false, timestamp: now });
    return false;
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(id);
    
    if (!response.ok) {
      modelCache.set(modelName, { available: false, timestamp: now });
      return false;
    }
    
    const data = await response.json() as { models?: { name: string }[] };
    const models = data.models || [];
    
    const cleanName = modelName.split(":")[0].toLowerCase();
    const available = models.some(
      m => m.name.toLowerCase().startsWith(cleanName) || m.name.toLowerCase() === modelName.toLowerCase()
    );
    
    modelCache.set(modelName, { available, timestamp: now });
    return available;
  } catch {
    modelCache.set(modelName, { available: false, timestamp: now });
    return false;
  }
}

