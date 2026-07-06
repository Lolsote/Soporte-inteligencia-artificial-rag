import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface MemoryState {
  sessions: Record<string, ConversationTurn[]>;
}

const CACHE_DIR = join(process.cwd(), ".cache");
const MEMORY_PATH = join(CACHE_DIR, "rag-memory.json");

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readState(): MemoryState {
  ensureCacheDir();
  if (!existsSync(MEMORY_PATH)) {
    return { sessions: {} };
  }

  try {
    const raw = readFileSync(MEMORY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<MemoryState>;
    return { sessions: parsed.sessions || {} };
  } catch {
    return { sessions: {} };
  }
}

function writeState(state: MemoryState): void {
  ensureCacheDir();
  writeFileSync(MEMORY_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function appendConversationMessage(sessionId: string, role: ConversationTurn["role"], content: string): void {
  const state = readState();
  const sessionHistory = state.sessions[sessionId] || [];
  sessionHistory.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });
  state.sessions[sessionId] = sessionHistory;
  writeState(state);
}

export function getConversation(sessionId: string): ConversationTurn[] {
  const state = readState();
  return state.sessions[sessionId] || [];
}

export function clearConversation(sessionId: string): void {
  const state = readState();
  delete state.sessions[sessionId];
  writeState(state);
}

export function getMemoryStats(): { totalSessions: number; totalMessages: number } {
  const state = readState();
  const totalMessages = Object.values(state.sessions).reduce((sum, messages) => sum + messages.length, 0);
  return {
    totalSessions: Object.keys(state.sessions).length,
    totalMessages,
  };
}
