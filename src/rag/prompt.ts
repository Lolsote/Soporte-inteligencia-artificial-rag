import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface PromptState {
  template: string;
  lastUpdated: string;
}

const CACHE_DIR = join(process.cwd(), ".cache");
const PROMPT_PATH = join(CACHE_DIR, "rag-prompt.json");

const DEFAULT_PROMPT = `Eres SoporteIA, un agente de inteligencia artificial especializado en soporte técnico IT.

REGLAS DE RESPUESTA:
1. Utiliza los fragmentos de documentación interna proporcionados a continuación como tu base de conocimiento principal para responder las consultas del usuario.
2. Si los fragmentos proporcionados no contienen la respuesta o no son suficientes, no te limites. Utiliza tu propio conocimiento general sobre tecnología, redes, sistemas e IT para responder la pregunta de forma útil, completa y conversacional.
3. Mantén un tono profesional, amigable y servicial en todo momento.

IMPORTANTE - ESCALAMIENTO AUTOMÁTICO:
Si detectas que el usuario describe o reporta un problema crítico de Nivel 3, específicamente:
- Un fallo de seguridad de red (ej. ataque de denegación de servicio DDoS, intrusión, sospecha de hackeo, puerto crítico abierto).
- Un despliegue de código fallido o caída crítica del sistema en producción (ej. error en despliegue de Git, caída de base de datos tras actualización, compilación fallida en main).

Debes añadir EXACTAMENTE una de las siguientes etiquetas en una nueva línea al final de tu respuesta (reemplazando categoria):
[ESCALAR: security] -> Si es un fallo de seguridad de red.
[ESCALAR: deployment] -> Si es un despliegue fallido o caída de código.

No agregues texto adicional a la etiqueta, colócala tal cual en una línea limpia.

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
