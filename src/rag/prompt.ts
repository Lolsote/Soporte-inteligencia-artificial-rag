import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface PromptState {
  template: string;
  lastUpdated: string;
}

const CACHE_DIR = join(process.cwd(), ".cache");
const PROMPT_PATH = join(CACHE_DIR, "rag-prompt.json");

const DEFAULT_PROMPT = `Eres SoporteIA, un agente de inteligencia artificial especializado en soporte técnico IT.

Usa EXCLUSIVAMENTE la información de los fragmentos de documentación proporcionados a continuación para responder.
Si no encuentras la respuesta en los fragmentos, responde: "No tengo información suficiente en mi base de conocimiento para responder esta consulta."

Sé preciso, técnico y directo. Si es relevante, incluye pasos concretos o comandos.

Contexto de la documentación interna:
{context}`;

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function loadPromptTemplate(): string {
  if (!existsSync(PROMPT_PATH)) {
    return DEFAULT_PROMPT;
  }

  try {
    const raw = readFileSync(PROMPT_PATH, "utf-8");
    const state = JSON.parse(raw) as PromptState;
    return state.template || DEFAULT_PROMPT;
  } catch {
    return DEFAULT_PROMPT;
  }
}

export function savePromptTemplate(template: string): void {
  ensureCacheDir();
  const state: PromptState = {
    template,
    lastUpdated: new Date().toISOString(),
  };
  writeFileSync(PROMPT_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function getPromptMetadata() {
  if (!existsSync(PROMPT_PATH)) {
    return { lastUpdated: null };
  }

  try {
    const raw = readFileSync(PROMPT_PATH, "utf-8");
    const state = JSON.parse(raw) as PromptState;
    return { lastUpdated: state.lastUpdated };
  } catch {
    return { lastUpdated: null };
  }
}
