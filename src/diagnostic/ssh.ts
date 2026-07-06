import { Client } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { config } from "../config.js";
import type { CommandName } from "./types.js";

interface SshConnConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  privateKey?: string;
  password?: string;
}

interface SshResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

let connectionCache: Map<string, SshConnConfig> = new Map();

function loadConfig(host: string): SshConnConfig | null {
  if (connectionCache.has(host)) {
    return connectionCache.get(host)!;
  }

  const sshConfigs = config.diagnostic.sshHosts;
  const found = sshConfigs.find((c) => c.host === host);
  if (found) {
    connectionCache.set(host, found);
    return found;
  }

  return null;
}

export function isSshHost(host: string): boolean {
  return loadConfig(host) !== null;
}

export async function executeViaSsh(
  host: string,
  shellCmd: string,
  _command: CommandName,
  timeout: number
): Promise<SshResult> {
  const sshConfig = loadConfig(host);
  if (!sshConfig) {
    return {
      stdout: "",
      stderr: `No hay configuración SSH para el host: ${host}`,
      exitCode: 1,
    };
  }

  return new Promise((resolve) => {
    const conn = new Client();
    const connectConfig: import("ssh2").ConnectConfig = {
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.username,
      readyTimeout: 10_000,
    };

    if (sshConfig.privateKeyPath) {
      const resolved = sshConfig.privateKeyPath.replace(
        /^~/, join()
      );
      if (existsSync(resolved)) {
        connectConfig.privateKey = readFileSync(resolved, "utf-8");
      }
    } else if (sshConfig.privateKey) {
      connectConfig.privateKey = sshConfig.privateKey;
    } else if (sshConfig.password) {
      connectConfig.password = sshConfig.password;
    }

    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;

    const timer = setTimeout(() => {
      conn.end();
      resolve({ stdout, stderr, exitCode: 1 });
    }, timeout);

    conn.on("ready", () => {
      conn.exec(shellCmd, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          resolve({ stdout: "", stderr: err.message, exitCode: 1 });
          return;
        }

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number | null) => {
          clearTimeout(timer);
          exitCode = code;
          conn.end();
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
        });

        stream.on("error", () => {
          clearTimeout(timer);
          conn.end();
          resolve({ stdout, stderr, exitCode: 1 });
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, exitCode: 1 });
    });

    conn.connect(connectConfig);
  });
}
