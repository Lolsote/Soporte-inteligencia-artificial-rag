import type { CommandDef, DiagnosticRequest } from "./types.js";

const DANGEROUS_SHELL_PATTERNS = /[;&|<>`\\]/;
const CONTROL_CHARACTERS = /[\r\n]/;

export function isSafeShellValue(value: string): boolean {
  if (CONTROL_CHARACTERS.test(value)) return false;
  if (DANGEROUS_SHELL_PATTERNS.test(value)) return false;
  return true;
}

export function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function validateDiagnosticRequest(
  request: DiagnosticRequest,
  cmd: CommandDef,
): { allowed: boolean; error?: string } {
  if (cmd.riskLevel === "high") {
    return {
      allowed: false,
      error: `El comando '${cmd.name}' es de riesgo alto y no está permitido.`,
    };
  }

  if (request.host) {
    if (!isSafeShellValue(request.host)) {
      return {
        allowed: false,
        error: "El host contiene caracteres peligrosos o no válidos.",
      };
    }
  }

  if (request.args) {
    if (cmd.minArgs !== undefined && request.args.length < cmd.minArgs) {
      return {
        allowed: false,
        error: `El comando '${cmd.name}' requiere al menos ${cmd.minArgs} argumento(s).`,
      };
    }
    if (cmd.maxArgs !== undefined && request.args.length > cmd.maxArgs) {
      return {
        allowed: false,
        error: `El comando '${cmd.name}' admite como máximo ${cmd.maxArgs} argumento(s).`,
      };
    }

    for (const arg of request.args) {
      if (!isSafeShellValue(arg)) {
        return {
          allowed: false,
          error: `El argumento '${arg}' contiene caracteres peligrosos o no permitidos.`,
        };
      }
      if (cmd.allowedArgsPattern && !cmd.allowedArgsPattern.test(arg)) {
        return {
          allowed: false,
          error: `El argumento '${arg}' no cumple el patrón permitido para '${cmd.name}'.`,
        };
      }
    }
  }

  return { allowed: true };
}
