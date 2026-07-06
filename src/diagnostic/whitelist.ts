import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { WhitelistEntry, CommandName } from "./types.js";

const WHITELIST_PATH = join(process.cwd(), "whitelist.json");

const defaults: WhitelistEntry[] = [
  {
    host: "192.168.1.10",
    label: "API Gateway",
    allowedCommands: ["ping", "nc", "curl"],
  },
  {
    host: "192.168.1.20",
    label: "Base de Datos Principal",
    allowedCommands: ["ping", "nc"],
  },
  {
    host: "192.168.1.30",
    label: "Redis Cache",
    allowedCommands: ["ping", "redis-cli"],
  },
  {
    host: "8.8.8.8",
    label: "DNS Público (Google)",
    allowedCommands: ["ping", "traceroute"],
  },
  {
    host: "google.com",
    label: "Internet (DNS)",
    allowedCommands: ["ping", "nslookup", "dig", "traceroute"],
  },
];

function loadRaw(): WhitelistEntry[] {
  if (!existsSync(WHITELIST_PATH)) {
    saveRaw(defaults);
    return defaults;
  }
  try {
    const raw = readFileSync(WHITELIST_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return defaults;
  }
}

function saveRaw(entries: WhitelistEntry[]): void {
  writeFileSync(WHITELIST_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export function isHostAllowed(host: string, command: CommandName): boolean {
  const entries = loadRaw();
  const entry = entries.find((e) => e.host === host);
  if (!entry) return false;
  return entry.allowedCommands.includes(command);
}

export function listWhitelist(): WhitelistEntry[] {
  return loadRaw();
}

export function addWhitelistEntry(entry: WhitelistEntry): void {
  const entries = loadRaw();
  const idx = entries.findIndex((e) => e.host === entry.host);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  saveRaw(entries);
}

export function removeWhitelistEntry(host: string): boolean {
  const entries = loadRaw();
  const filtered = entries.filter((e) => e.host !== host);
  if (filtered.length === entries.length) return false;
  saveRaw(filtered);
  return true;
}
