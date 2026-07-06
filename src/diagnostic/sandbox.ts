import { execSync } from "child_process";
import { getCommand } from "./catalog.js";
import type { CommandName, ExecutionMode } from "./types.js";

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function executeInSandbox(
  command: CommandName,
  host: string | null,
  args: string[],
  mode: ExecutionMode
): Promise<ExecResult> {
  const cmd = getCommand(command);
  if (!cmd) {
    return { stdout: "", stderr: `Comando desconocido: ${command}`, exitCode: 1 };
  }

  if (mode === "sandbox" && !hasDocker()) {
    return {
      stdout: "",
      stderr: "Docker no disponible para modo sandbox. Use modo local o configure Docker.",
      exitCode: 1,
    };
  }

  const shellCmd = buildShellCommand(cmd.template, host, args);
  return execute(shellCmd, mode, cmd.timeout);
}

function resolveMode(mode: ExecutionMode): ExecutionMode {
  return mode;
}

function hasDocker(): boolean {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function buildShellCommand(template: string, host: string | null, args: string[]): string {
  let cmd = template;
  if (host) {
    cmd = cmd.replace(/{host}/g, host);
  }
  if (args.length > 0) {
    cmd = cmd.replace(/{args}/g, args.join(" "));
  }
  cmd = cmd.replace(/{host}/g, "").replace(/{args}/g, "");
  return cmd;
}

async function execute(
  shellCmd: string,
  mode: ExecutionMode,
  timeout: number
): Promise<ExecResult> {
  if (mode === "sandbox") {
    return executeDocker(shellCmd, timeout);
  }
  return executeLocal(shellCmd, timeout);
}

async function executeDocker(shellCmd: string, timeout: number): Promise<ExecResult> {
  try {
    const dockerCmd = [
      "docker", "run", "--rm",
      "--network", "none",
      "--cap-drop", "ALL",
      "--cap-add", "NET_RAW",
      "--security-opt", "no-new-privileges:true",
      "--memory", "64m",
      "--cpus", "0.5",
      "--pids-limit", "50",
      "--read-only",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
      "--tmpfs", "/var/log:rw,noexec,nosuid,size=16m",
      "alpine:latest",
      "sh", "-c",
      shellCmd,
    ];

    const stdout = execSync(dockerCmd.join(" "), {
      timeout,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    });

    return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const error = err as Error & { stderr?: string; status?: number; stdout?: string };
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
      exitCode: error.status ?? 1,
    };
  }
}

async function executeLocal(shellCmd: string, timeout: number): Promise<ExecResult> {
  try {
    const stdout = execSync(shellCmd, {
      timeout,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh",
    });

    return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const error = err as Error & { stderr?: string; status?: number; stdout?: string };
    return {
      stdout: (error.stdout as string) || "",
      stderr: error.stderr || error.message,
      exitCode: error.status ?? 1,
    };
  }
}
