import "dotenv/config";

interface SshHostConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  privateKey?: string;
  password?: string;
}

interface AuthTokenConfig {
  token: string;
  user: string;
  role: "level1" | "level2" | "admin";
}

function normalizeBaseUrl(rawUrl?: string): string {
  const value = rawUrl?.trim();
  if (!value) return "http://127.0.0.1:11434";

  return value
    .replace(/^https?:\/\/localhost(?=[:/]|$)/i, "http://127.0.0.1")
    .replace(/^https?:\/\/127\.0\.0\.1(?=[:/]|$)/i, "http://127.0.0.1");
}

export const config = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
  },
  ollama: {
    baseUrl: normalizeBaseUrl(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"),
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
    llmModel: process.env.OLLAMA_LLM_MODEL || "llama3",
  },
  chroma: {
    url: process.env.CHROMA_URL || "http://localhost:8000",
    collectionName: process.env.CHROMA_COLLECTION_NAME || "soporteia_docs",
  },
  diagnostic: {
    rateLimit: {
      maxRequests: parseInt(process.env.DIAG_MAX_REQUESTS || "30", 10),
      windowMs: parseInt(process.env.DIAG_WINDOW_MS || "60000", 10),
    },
    sshHosts: parseSshHosts<SshHostConfig[]>(),
    defaultMode: (process.env.DIAG_DEFAULT_MODE || "sandbox") as "sandbox" | "local" | "ssh",
  },
  auth: {
    tokens: parseAuthTokens<AuthTokenConfig[]>(),
    allowAnonymous: process.env.AUTH_ALLOW_ANONYMOUS === "true",
  },
  escalation: {
    webhookType: (process.env.ESCALATION_WEBHOOK_TYPE || "generic") as "generic" | "slack" | "jira" | "servicenow",
    webhookUrl: process.env.ESCALATION_WEBHOOK_URL || "",
    webhookAuth: process.env.ESCALATION_WEBHOOK_AUTH || "",
    classificationModel: process.env.ESCALATION_CLASSIFICATION_MODEL || "llama3",
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
  },
};

function parseAuthTokens<T>(): T {
  const raw = process.env.AUTH_TOKENS || process.env.AUTH_TOKEN;
  if (!raw) return [] as unknown as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    const token = raw.trim();
    if (!token) return [] as unknown as T;

    return [
      {
        token,
        user: process.env.AUTH_USER || "api-user",
        role: (process.env.AUTH_ROLE || "level1") as "level1" | "level2" | "admin",
      },
    ] as unknown as T;
  }
}

function parseSshHosts<T>(): T {
  const raw = process.env.DIAG_SSH_HOSTS;
  if (!raw) return [] as unknown as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return [] as unknown as T;
  }
}
