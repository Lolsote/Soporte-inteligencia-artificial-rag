import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { AuditEntry, DiagnosticRequest, DiagnosticResult } from "./types.js";

const AUDIT_DIR = join(process.cwd(), "audit_logs");
const AUDIT_FILE = join(AUDIT_DIR, "diagnostic-audit.jsonl");
const MAX_ENTRIES = 10_000;

export function logAudit(
  request: DiagnosticRequest,
  result: Pick<DiagnosticResult, "success" | "timing" | "error" | "mode">,
  user: string
): void {
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }

  const entry: AuditEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    user,
    request,
    result,
  };

  try {
    writeFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n", { flag: "a" });
  } catch {
    console.error("No se pudo escribir auditoría");
  }

  trimAudit();
}

export function readAudit(limit = 50, offset = 0): AuditEntry[] {
  if (!existsSync(AUDIT_FILE)) return [];

  try {
    const raw = readFileSync(AUDIT_FILE, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean).reverse();
    return lines.slice(offset, offset + limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function trimAudit(): void {
  if (!existsSync(AUDIT_FILE)) return;
  try {
    const raw = readFileSync(AUDIT_FILE, "utf-8");
    const lines = raw.trim().split("\n");
    if (lines.length > MAX_ENTRIES) {
      writeFileSync(AUDIT_FILE, lines.slice(-MAX_ENTRIES).join("\n") + "\n");
    }
  } catch {
    // ignore
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
