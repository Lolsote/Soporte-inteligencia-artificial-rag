import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { getLLM } from "../rag/llm.js";
import { similaritySearch } from "../rag/vectorstore.js";
import { config } from "../config.js";
import type {
  DiagnosticRequest,
  DiagnosticResult,
  IncidentTicket,
  IncidentSeverity,
  StructuredIncidentSummary,
  IncidentCategory,
  TicketPriority,
} from "./types.js";

const TICKETS_DIR = join(process.cwd(), "tickets");
const TICKETS_FILE = join(TICKETS_DIR, "incident-tickets.jsonl");

const ASSIGNMENT_BY_SEVERITY: Record<IncidentSeverity, string> = {
  low: "Soporte Nivel 1",
  medium: "Soporte Nivel 2",
  high: "Soporte Nivel 3",
  critical: "Equipo de Seguridad de Red",
};

const TEAM_BY_CATEGORY: Record<IncidentCategory, string> = {
  network: "Infraestructura de Red",
  security: "Seguridad de Red",
  service: "Operaciones de Servicio",
  deployment: "DevOps",
  infrastructure: "Infraestructura",
  configuration: "Soporte de Configuración",
  other: "Equipo de Soporte General",
};

const PRIORITY_BY_SEVERITY: Record<IncidentSeverity, TicketPriority> = {
  low: "P3",
  medium: "P2",
  high: "P1",
  critical: "P0",
};

function ensureTicketsDir(): void {
  if (!existsSync(TICKETS_DIR)) {
    mkdirSync(TICKETS_DIR, { recursive: true });
  }
}

export function assessIncidentSeverity(result: DiagnosticResult): IncidentSeverity {
  if (!result.success) {
    if (result.command === "systemctl" || result.command === "curl" || result.command === "redis-cli") {
      return "critical";
    }
    if (result.mode === "ssh" || result.error?.includes("No hay configuración SSH")) {
      return "high";
    }
    return "medium";
  }

  const parsed = result.parsed;
  if (parsed.type === "ping" && parsed.packetLoss > 20) {
    return "high";
  }
  if (parsed.type === "curl" && parsed.httpCode !== null && parsed.httpCode >= 500) {
    return "high";
  }
  if (parsed.type === "service-status" && !parsed.active) {
    return "high";
  }
  if (parsed.type === "dns" && parsed.resolvedIps.length === 0) {
    return "medium";
  }
  return "low";
}

export function shouldEscalate(result: DiagnosticResult): boolean {
  const severity = result.severity ?? assessIncidentSeverity(result);
  return severity === "high" || severity === "critical";
}

export async function classifyIncident(result: DiagnosticResult): Promise<{
  severity: IncidentSeverity;
  structuredSummary: StructuredIncidentSummary;
  incidentCategory: IncidentCategory;
  priority: TicketPriority;
}> {
  const incidentReport = buildIncidentReport(result);

  let context = "";
  try {
    const docs = await similaritySearch(incidentReport, 3);
    context = docs.map(([doc]) => `${doc.pageContent}`).filter(Boolean).join("\n\n");
  } catch {
    context = "";
  }

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "Eres un asistente de clasificación de incidentes IT. Evalúa un diagnóstico de red o servicio y responde exclusivamente con JSON válido.",
    ],
    [
      "human",
      "Dado el siguiente contexto de documentación interna y el detalle del incidente, responde con un objeto JSON que contenga: severity (low|medium|high|critical), category (network|security|service|deployment|infrastructure|configuration|other), priority (P0|P1|P2|P3), impact, evidence, recommendedAction, rationale.\n\nContexto:\n{context}\n\nIncidente:\n{incident}"
    ],
  ]);

  const llm = await getLLM();
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  let reply = "";
  try {
    reply = await chain.invoke({ context, incident: incidentReport });
  } catch {
    return {
      severity: assessIncidentSeverity(result),
      incidentCategory: inferIncidentCategory(result),
      priority: PRIORITY_BY_SEVERITY[assessIncidentSeverity(result)],
      structuredSummary: buildStructuredSummary(result, assessIncidentSeverity(result)),
    };
  }

  const parsed = parseJsonReply(reply);
  if (!parsed) {
    return {
      severity: assessIncidentSeverity(result),
      incidentCategory: inferIncidentCategory(result),
      priority: PRIORITY_BY_SEVERITY[assessIncidentSeverity(result)],
      structuredSummary: buildStructuredSummary(result, assessIncidentSeverity(result)),
    };
  }

  const severity = parsed.severity ?? assessIncidentSeverity(result);
  return {
    severity,
    incidentCategory: parsed.category || inferIncidentCategory(result),
    priority: parsed.priority || PRIORITY_BY_SEVERITY[severity],
    structuredSummary: {
      impact: parsed.impact || buildStructuredSummary(result, severity).impact,
      evidence: parsed.evidence || buildStructuredSummary(result, severity).evidence,
      recommendedAction:
        parsed.recommendedAction || buildStructuredSummary(result, severity).recommendedAction,
      rationale: parsed.rationale || buildStructuredSummary(result, severity).rationale,
    },
  };
}

function parseJsonReply(reply: string): Partial<StructuredIncidentSummary & { severity: IncidentSeverity; category?: IncidentCategory; priority?: TicketPriority; }> | null {
  const jsonMatch = reply.match(/\{[\s\S]*\}/m);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed;
  } catch {
    return null;
  }
}

function buildIncidentSummary(result: DiagnosticResult): string {
  const lines: string[] = [];
  lines.push(`Comando: ${result.command}`);
  lines.push(`Modo: ${result.mode}`);
  if (result.host) lines.push(`Host: ${result.host}`);
  lines.push(`Resultado: ${result.parsed.summary}`);
  lines.push(`Éxito: ${result.success ? "Sí" : "No"}`);
  if (result.error) lines.push(`Error: ${result.error}`);
  lines.push(`Duración: ${result.timing} ms`);
  return lines.join(". ") + ".";
}

function buildTicketDetails(
  request: DiagnosticRequest,
  result: DiagnosticResult,
  summary: string,
): string {
  return JSON.stringify(
    {
      requestedBy: request.user || "unknown",
      command: request.command,
      host: request.host,
      mode: request.mode,
      args: request.args,
      metadata: request.metadata,
      summary,
      rawOutput: result.rawOutput,
      error: result.error,
      parsed: result.parsed,
      severity: result.severity,
    },
    null,
    2,
  );
}

function buildIncidentReport(result: DiagnosticResult): string {
  const lines: string[] = [];
  lines.push(`Comando: ${result.command}`);
  lines.push(`Modo: ${result.mode}`);
  if (result.host) lines.push(`Host: ${result.host}`);
  lines.push(`Éxito: ${result.success ? "Sí" : "No"}`);
  lines.push(`Resumen: ${result.parsed.summary}`);
  if (result.error) lines.push(`Error: ${result.error}`);
  lines.push(`Duración: ${result.timing} ms`);
  if (result.rawOutput) lines.push(`Salida: ${result.rawOutput}`);
  return lines.join("\n");
}

export function buildStructuredSummary(
  result: DiagnosticResult,
  severity: IncidentSeverity,
): StructuredIncidentSummary {
  const evidence = collectEvidence(result);
  const impact = severity === "critical"
    ? "Interrupción grave de servicio o riesgo de seguridad que afecta disponibilidad y operación."
    : severity === "high"
    ? "Problema significativo que puede causar degradación de servicio y requiere atención rápida."
    : severity === "medium"
    ? "Falla puntual o anomalía con impacto moderado en los servicios."
    : "Condición leve o informativa que puede ser monitoreada sin acción urgente.";

  const recommendedAction = severity === "critical"
    ? "Asignar inmediatamente a un ingeniero de seguridad de red, recopilar logs adicionales y mitigar el incidente antes de restaurar servicios."
    : severity === "high"
    ? "Escalar a nivel 3, verificar estado de servicios y rutas, y corregir fallos de configuración o disponibilidad."
    : severity === "medium"
    ? "Monitorear el evento, revisar configuración y ejecutar pruebas adicionales si persiste."
    : "Registrar la condición y continuar con el monitoreo regular.";

  return {
    impact,
    evidence,
    recommendedAction,
    rationale: `Clasificación basada en resultado de diagnóstico y nivel de gravedad detectado: ${severity}.`,
  };
}

function collectEvidence(result: DiagnosticResult): string {
  const items: string[] = [];
  if (result.error) items.push(`Error: ${result.error}`);
  items.push(`Resumen: ${result.parsed.summary}`);
  if (result.command === "ping" && result.parsed.type === "ping") {
    items.push(`Pérdida de paquetes ${result.parsed.packetLoss}%`);
  }
  if (result.command === "curl" && result.parsed.type === "curl") {
    items.push(`HTTP Code ${result.parsed.httpCode}`);
  }
  if (result.command === "systemctl" && result.parsed.type === "service-status") {
    items.push(`Servicio ${result.parsed.serviceName} activo=${result.parsed.active}`);
  }
  return items.join("; ");
}

function inferIncidentCategory(result: DiagnosticResult): IncidentCategory {
  if (result.command === "systemctl" || result.command === "journalctl") return "service";
  if (result.command === "curl" || result.command === "ping" || result.command === "traceroute") return "network";
  if (result.command === "redis-cli") return "service";
  if (result.command === "nslookup" || result.command === "dig" || result.command === "host") return "network";
  if (result.error?.toLowerCase().includes("permission") || result.error?.toLowerCase().includes("firewall")) return "security";
  if (result.error?.toLowerCase().includes("deployment") || result.error?.toLowerCase().includes("failed to deploy")) return "deployment";
  return "other";
}

function computeSlaTarget(priority: TicketPriority): string {
  switch (priority) {
    case "P0":
      return "1h";
    case "P1":
      return "4h";
    case "P2":
      return "8h";
    default:
      return "24h";
  }
}

interface WebhookPayload {
  ticketId: string;
  severity: IncidentSeverity;
  status: IncidentTicket["status"];
  assignedTo: string;
  assignedTeam: string;
  incidentCategory: IncidentCategory;
  priority: TicketPriority;
  slaTarget: string;
  summary: string;
  structuredSummary: StructuredIncidentSummary;
  source: string;
  createdAt: string;
  updatedAt: string;
}

function buildWebhookBody(payload: WebhookPayload): unknown {
  switch (config.escalation.webhookType) {
    case "slack":
      return {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Nuevo ticket de soporte*\n*ID:* ${payload.ticketId}\n*Severidad:* ${payload.severity}\n*Equipo:* ${payload.assignedTeam}\n*Prioridad:* ${payload.priority}`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Estado:*\n${payload.status}` },
              { type: "mrkdwn", text: `*Categoría:*\n${payload.incidentCategory}` },
              { type: "mrkdwn", text: `*SLA:*\n${payload.slaTarget}` },
            ],
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*Resumen:*\n${payload.summary}` },
          },
        ],
      };
    case "jira":
      return {
        fields: {
          summary: `Incidente ${payload.ticketId} - ${payload.priority}`,
          description: `*Resumen:* ${payload.summary}\n*Severidad:* ${payload.severity}\n*Equipo:* ${payload.assignedTeam}\n*Categoría:* ${payload.incidentCategory}\n*Recomendación:* ${payload.structuredSummary.recommendedAction}`,
          issuetype: { name: "Task" },
          priority: { name: mapPriorityToJira(payload.priority as TicketPriority) },
          labels: [String(payload.incidentCategory || "incident"), "soporteia"],
        },
      };
    case "servicenow":
      return {
        short_description: `Ticket ${payload.ticketId}: ${payload.summary}`,
        description: `Severidad: ${payload.severity}\nEquipo: ${payload.assignedTeam}\nCategoría: ${payload.incidentCategory}\nRecomendación: ${payload.structuredSummary.recommendedAction}`,
        urgency: mapPriorityToServiceNowUrgency(payload.priority as TicketPriority),
        impact: mapPriorityToServiceNowImpact(payload.priority as TicketPriority),
        assignment_group: payload.assignedTeam,
      };
    default:
      return payload as unknown;
  }
}

function mapPriorityToJira(priority: TicketPriority): string {
  switch (priority) {
    case "P0":
      return "Highest";
    case "P1":
      return "High";
    case "P2":
      return "Medium";
    default:
      return "Low";
  }
}

function mapPriorityToServiceNowUrgency(priority: TicketPriority): string {
  return priority === "P0" || priority === "P1" ? "1" : "2";
}

function mapPriorityToServiceNowImpact(priority: TicketPriority): string {
  return priority === "P0" ? "1" : priority === "P1" ? "2" : "3";
}


async function sendToWebhook(ticket: IncidentTicket): Promise<void> {
  const payload = {
    ticketId: ticket.id,
    severity: ticket.severity,
    status: ticket.status,
    assignedTo: ticket.assignedTo,
    assignedTeam: ticket.assignedTeam,
    incidentCategory: ticket.incidentCategory,
    priority: ticket.priority,
    slaTarget: ticket.slaTarget,
    summary: ticket.summary,
    structuredSummary: ticket.structuredSummary,
    source: ticket.source || "auto",
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt || ticket.createdAt,
  };

  const prefix = config.escalation.webhookType === "jira" 
    ? "JIRA-" 
    : config.escalation.webhookType === "servicenow" 
    ? "INC00" 
    : "EXT-";
  
  const mockId = `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;

  if (!config.escalation.webhookUrl) {
    ticket.remoteId = mockId;
    ticket.statusHistory.push({
      timestamp: new Date().toISOString(),
      status: ticket.status,
      assignee: ticket.assignedTo,
      team: ticket.assignedTeam,
      note: `[Simulador ITSM ${config.escalation.webhookType.toUpperCase()}] Ticket registrado automáticamente. ID Remoto: ${mockId}`,
    });
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.escalation.webhookAuth) {
    headers["Authorization"] = config.escalation.webhookAuth;
  }

  try {
    const res = await fetch(config.escalation.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(buildWebhookBody(payload)),
    });
    
    if (res.ok) {
      const resBody = await res.json().catch(() => ({}));
      const remoteId = resBody.key || resBody.number || resBody.sys_id || resBody.id || mockId;
      ticket.remoteId = String(remoteId);
      ticket.statusHistory.push({
        timestamp: new Date().toISOString(),
        status: ticket.status,
        assignee: ticket.assignedTo,
        team: ticket.assignedTeam,
        note: `[API REST ${config.escalation.webhookType.toUpperCase()}] Confirmación externa recibida. ID Remoto: ${remoteId}`,
      });
    } else {
      ticket.remoteId = mockId;
      ticket.statusHistory.push({
        timestamp: new Date().toISOString(),
        status: ticket.status,
        assignee: ticket.assignedTo,
        team: ticket.assignedTeam,
        note: `[API REST ${config.escalation.webhookType.toUpperCase()}] Webhook falló (Status ${res.status}). Simulación activada, ID asignado: ${mockId}`,
      });
    }
  } catch (err: any) {
    ticket.remoteId = mockId;
    ticket.statusHistory.push({
      timestamp: new Date().toISOString(),
      status: ticket.status,
      assignee: ticket.assignedTo,
      team: ticket.assignedTeam,
      note: `[API REST ${config.escalation.webhookType.toUpperCase()}] Error de red (${err.message}). Simulación activada, ID asignado: ${mockId}`,
    });
  }
}

export async function createTicket(
  request: DiagnosticRequest,
  result: DiagnosticResult,
  severity: IncidentSeverity,
  structuredSummary: StructuredIncidentSummary,
  incidentCategory: IncidentCategory,
  priority: TicketPriority,
): Promise<IncidentTicket> {
  const ticketSummary = buildIncidentSummary(result);

  const ticket: IncidentTicket = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    severity,
    status: "opened",
    assignedTo: ASSIGNMENT_BY_SEVERITY[severity],
    assignedTeam: TEAM_BY_CATEGORY[incidentCategory],
    incidentCategory,
    priority,
    slaTarget: computeSlaTarget(priority),
    summary: ticketSummary,
    structuredSummary,
    details: buildTicketDetails(request, result, ticketSummary),
    updatedAt: new Date().toISOString(),
    source: "auto",
    statusHistory: [
      {
        timestamp: new Date().toISOString(),
        status: "opened",
        assignee: ASSIGNMENT_BY_SEVERITY[severity],
        team: TEAM_BY_CATEGORY[incidentCategory],
        note: "Ticket generado automáticamente por escalamiento híbrido inteligente",
      },
    ],
  };

  await sendToWebhook(ticket);
  ensureTicketsDir();
  writeFileSync(TICKETS_FILE, JSON.stringify(ticket) + "\n", { flag: "a" });
  return ticket;
}

export function readTickets(limit = 50, offset = 0): IncidentTicket[] {
  if (!existsSync(TICKETS_FILE)) return [];

  const raw = readFileSync(TICKETS_FILE, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean).reverse();
  return lines.slice(offset, offset + limit).map((line) => JSON.parse(line) as IncidentTicket);
}

export function getTicketById(id: string): IncidentTicket | null {
  if (!existsSync(TICKETS_FILE)) return null;

  const raw = readFileSync(TICKETS_FILE, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean).reverse();
  for (const line of lines) {
    const ticket = JSON.parse(line) as IncidentTicket;
    if (ticket.id === id) return ticket;
  }
  return null;
}

const VALID_TICKET_STATUSES: IncidentTicket["status"][] = ["opened", "assigned", "resolved", "closed", "reopened"];

export function updateTicketState(id: string, state: string, assignee?: string): IncidentTicket | null {
  if (!VALID_TICKET_STATUSES.includes(state as IncidentTicket["status"])) {
    return null;
  }

  if (!existsSync(TICKETS_FILE)) return null;

  const raw = readFileSync(TICKETS_FILE, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);
  const tickets = lines.map((line) => JSON.parse(line) as IncidentTicket);
  const index = tickets.findIndex((ticket) => ticket.id === id);
  if (index === -1) return null;

  const ticket = tickets[index];
  ticket.status = state as IncidentTicket["status"];
  ticket.updatedAt = new Date().toISOString();
  if (assignee) {
    ticket.assignedTo = assignee;
  }
  ticket.statusHistory.push({
    timestamp: new Date().toISOString(),
    status: state as IncidentTicket["status"],
    assignee: assignee || ticket.assignedTo,
    team: ticket.assignedTeam,
    note: `Estado actualizado a ${state}`,
  });
  tickets[index] = ticket;

  writeFileSync(TICKETS_FILE, tickets.map((ticketEntry) => JSON.stringify(ticketEntry)).join("\n") + "\n");
  return ticket;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
