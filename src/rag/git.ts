import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const REPO_CACHE_DIR = join(process.cwd(), ".cache", "repos");

function ensureRepoCacheDir(): void {
  if (!existsSync(REPO_CACHE_DIR)) {
    mkdirSync(REPO_CACHE_DIR, { recursive: true });
  }
}

function sanitizeRepoName(repoUrl: string): string {
  return repoUrl
    .replace(/^(https?:\/\/|git@)/, "")
    .replace(/[\/\:\?\&\=\@\#\%\+\s]+/g, "_")
    .replace(/[^a-zA-Z0-9_\-\.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getRepoDir(repoUrl: string): string {
  ensureRepoCacheDir();
  const repoName = sanitizeRepoName(repoUrl);
  return join(REPO_CACHE_DIR, repoName);
}

function getShell(): string {
  return process.platform === "win32" ? "cmd.exe" : "/bin/sh";
}

export function cloneOrUpdateRepo(repoUrl: string): string {
  ensureRepoCacheDir();
  const repoDir = getRepoDir(repoUrl);

  try {
    if (!existsSync(repoDir)) {
      execSync(`git clone --depth 1 "${repoUrl}" "${repoDir}"`, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: getShell(),
        timeout: 180_000,
      });
    } else {
      execSync(`git -C "${repoDir}" pull --ff-only`, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: getShell(),
        timeout: 120_000,
      });
    }
  } catch (err: unknown) {
    const error = err as Error & { message?: string; stderr?: string };
    const message = error.stderr || error.message || "Error al clonar o actualizar el repositorio";
    throw new Error(`Repo '${repoUrl}' no disponible: ${message}`);
  }

  return repoDir;
}

export async function prepareRepos(repoUrls: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const repoUrl of repoUrls) {
    if (!repoUrl || typeof repoUrl !== "string") continue;
    const localDir = cloneOrUpdateRepo(repoUrl);
    results.push(localDir);
  }
  return results;
}
