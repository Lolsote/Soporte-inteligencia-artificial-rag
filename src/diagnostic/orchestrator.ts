import { getCommand } from "./catalog.js";
import { executeInSandbox } from "./sandbox.js";
import { executeViaSsh, isSshHost } from "./ssh.js";
import { parseOutput } from "./parser.js";
import { isHostAllowed } from "./whitelist.js";
import { checkRateLimit } from "./rate-limit.js";
import { logAudit } from "./audit.js";
import { config } from "../config.js";
import { validateDiagnosticRequest } from "./security.js";
import { assessIncidentSeverity, classifyIncident, createTicket, shouldEscalate } from "./escalation.js";
import type {
  DiagnosticRequest,
  DiagnosticResult,
  ExecutionMode,
} from "./types.js";

export async function runDiagnostic(
  request: DiagnosticRequest,
  userId: string = "anonymous"
): Promise<DiagnosticResult> {
  const t0 = performance.now();
  const cmd = getCommand(request.command);

  if (!cmd) {
    return {
      command: request.command,
      host: request.host ?? null,
      mode: request.mode ?? "local",
      rawOutput: "",
      parsed: { type: "generic", raw: "", summary: "Comando no soportado" },
      success: false,
      error: `Comando '${request.command}' no está en el catálogo permitido`,
      timing: 0,
      timestamp: new Date().toISOString(),
    };
  }

  if (cmd.requiresHost && !request.host) {
    return {
      command: request.command,
      host: null,
      mode: request.mode ?? "local",
      rawOutput: "",
      parsed: { type: "generic", raw: "", summary: "Host requerido" },
      success: false,
      error: `El comando '${request.command}' requiere un host`,
      timing: 0,
      timestamp: new Date().toISOString(),
    };
  }

  if (request.host && request.mode !== "ssh") {
    const allowed = isHostAllowed(request.host, request.command);
    if (!allowed) {
      return {
        command: request.command,
        host: request.host,
        mode: request.mode ?? "sandbox",
        rawOutput: "",
        parsed: { type: "generic", raw: "", summary: "Host no permitido" },
        success: false,
        error: `El host '${request.host}' no está autorizado para '${request.command}'`,
        timing: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  const validation = validateDiagnosticRequest(request, cmd);
  if (!validation.allowed) {
    return {
      command: request.command,
      host: request.host ?? null,
      mode: request.mode ?? "sandbox",
      rawOutput: "",
      parsed: { type: "generic", raw: "", summary: validation.error ?? "Solicitud inválida" },
      success: false,
      error: validation.error ?? "Solicitud inválida",
      timing: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const rateCheck = checkRateLimit(userId, config.diagnostic.rateLimit);
  if (!rateCheck.allowed) {
    return {
      command: request.command,
      host: request.host ?? null,
      mode: request.mode ?? "local",
      rawOutput: "",
      parsed: { type: "generic", raw: "", summary: "Rate limit excedido" },
      success: false,
      error: `Demasiadas solicitudes. Espera ${Math.ceil(rateCheck.resetMs / 1000)}s`,
      timing: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const mode: ExecutionMode = resolveMode(request, cmd.requiresHost);

  const host = request.host ?? null;
  const shellCmd = buildFullCommand(cmd.template, host, request.args);

  let execResult;
  if (mode === "ssh" && host) {
    execResult = await executeViaSsh(host, shellCmd, request.command, cmd.timeout);
  } else {
    execResult = await executeInSandbox(request.command, host, request.args ?? [], mode);
  }

  const t1 = performance.now();
  const timing = Math.round(t1 - t0);

  const parsed = parseOutput(
    cmd.parser,
    execResult.stdout || execResult.stderr,
    request.host ?? undefined
  );

  const success = execResult.exitCode === 0;
  const result: DiagnosticResult = {
    command: request.command,
    host: request.host ?? null,
    mode,
    rawOutput: execResult.stdout,
    parsed,
    success,
    error: success ? null : execResult.stderr || "Comando falló sin mensaje de error",
    timing,
    timestamp: new Date().toISOString(),
  };

  const classification = await classifyIncident(result);
  result.severity = classification.severity;

  if (shouldEscalate(result)) {
    result.ticket = await createTicket(
      request,
      result,
      classification.severity,
      classification.structuredSummary,
      classification.incidentCategory,
      classification.priority,
    );
  }

  logAudit(request, { success, timing, error: result.error, mode }, userId);

  return result;
}

function resolveMode(request: DiagnosticRequest, requiresHost: boolean): ExecutionMode {
  if (request.mode === "ssh") {
    if (request.host && isSshHost(request.host)) return "ssh";
    return request.mode;
  }
  if (request.mode === "sandbox") return "sandbox";
  if (request.mode === "local") return "local";
  if (requiresHost && request.host && isSshHost(request.host)) return "ssh";
  return "sandbox";
}

function buildFullCommand(template: string, host: string | null, args: string[] | undefined): string {
  let cmd = template;
  if (host) cmd = cmd.replace(/{host}/g, host);
  if (args && args.length > 0) {
    cmd = cmd.replace(/{args}/g, args.join(" "));
    if (!cmd.includes("{args}")) {
      cmd += " " + args.join(" ");
    }
  }
  cmd = cmd.replace(/{host}/g, "").replace(/{args}/g, "");
  return cmd;
}
