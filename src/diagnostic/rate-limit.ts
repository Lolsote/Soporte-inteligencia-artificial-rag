import type { RateLimitConfig } from "./types.js";

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000,
};

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();

export function checkRateLimit(
  userId: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  let entry = windows.get(userId);

  if (!entry) {
    entry = { timestamps: [] };
    windows.set(userId, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldest = entry.timestamps[0];
    const resetMs = oldest + config.windowMs - now;
    return { allowed: false, remaining: 0, resetMs: Math.max(0, resetMs) };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    resetMs: 0,
  };
}

export function resetRateLimit(userId: string): void {
  windows.delete(userId);
}
