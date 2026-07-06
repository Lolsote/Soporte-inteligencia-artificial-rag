import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { scanDocumentsInPaths } from "./loader.js";

export interface FileState {
  path: string;
  size: number;
  mtime: number;
}

interface IndexState {
  files: Record<string, FileState>;
  lastUpdated: string;
}

const CACHE_DIR = join(process.cwd(), ".cache");
const STATE_PATH = join(CACHE_DIR, "rag-index.json");

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function loadIndexState(): IndexState {
  if (!existsSync(STATE_PATH)) {
    return { files: {}, lastUpdated: new Date().toISOString() };
  }

  try {
    const raw = readFileSync(STATE_PATH, "utf-8");
    return JSON.parse(raw) as IndexState;
  } catch {
    return { files: {}, lastUpdated: new Date().toISOString() };
  }
}

export function saveIndexState(files: Record<string, FileState>): void {
  ensureCacheDir();
  const state: IndexState = {
    files,
    lastUpdated: new Date().toISOString(),
  };
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function clearIndexState(): void {
  ensureCacheDir();
  writeFileSync(
    STATE_PATH,
    JSON.stringify({ files: {}, lastUpdated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

export function createIndexState(paths: string[]): Record<string, FileState> {
  const currentFiles = getCurrentFileStates(paths);
  return currentFiles.reduce((acc, file) => {
    acc[file.path] = file;
    return acc;
  }, {} as Record<string, FileState>);
}

export function getCurrentFileStates(paths: string[]): FileState[] {
  const files = scanDocumentsInPaths(paths);
  return files.map((filePath) => {
    const stat = statSync(filePath);
    return {
      path: filePath,
      size: stat.size,
      mtime: stat.mtimeMs,
    };
  });
}

export function detectDocChanges(paths: string[]) {
  const currentFiles = getCurrentFileStates(paths);
  const previousState = loadIndexState();
  const previousFiles = previousState.files;
  const currentMap: Record<string, FileState> = {};
  const added: FileState[] = [];
  const modified: FileState[] = [];
  const unchanged: FileState[] = [];

  for (const file of currentFiles) {
    currentMap[file.path] = file;
    const previousFile = previousFiles[file.path];

    if (!previousFile) {
      added.push(file);
      continue;
    }

    if (file.size !== previousFile.size || file.mtime !== previousFile.mtime) {
      modified.push(file);
      continue;
    }

    unchanged.push(file);
  }

  const deleted = Object.keys(previousFiles).filter((path) => !currentMap[path]);

  return {
    added,
    modified,
    deleted,
    unchanged,
    current: currentMap,
    previous: previousFiles,
    lastUpdated: previousState.lastUpdated,
  };
}
