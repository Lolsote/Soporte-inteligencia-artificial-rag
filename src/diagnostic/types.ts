export type CommandName =
  | "ping"
  | "traceroute"
  | "netstat"
  | "ss"
  | "nslookup"
  | "dig"
  | "curl"
  | "nc"
  | "systemctl"
  | "redis-cli"
  | "ip"
  | "route"
  | "journalctl"
  | "uptime"
  | "df"
  | "free"
  | "host";

export type RiskLevel = "low" | "medium" | "high";

export type ExecutionMode = "sandbox" | "ssh" | "local";

export interface CommandDef {
  name: CommandName;
  description: string;
  template: string;
  example: string;
  riskLevel: RiskLevel;
  requiresHost: boolean;
  parser: ParserType;
  timeout: number;
  minArgs?: number;
  maxArgs?: number;
  allowedArgsPattern?: RegExp;
}

export type ParserType =
  | "ping"
  | "traceroute"
  | "netstat"
  | "service-status"
  | "redis-ping"
  | "generic"
  | "curl"
  | "dns";

export interface DiagnosticRequest {
  command: CommandName;
  host?: string;
  args?: string[];
  mode?: ExecutionMode;
  user?: string;
  metadata?: Record<string, string>;
}

export interface DiagnosticResult {
  command: CommandName;
  host: string | null;
  mode: ExecutionMode;
  rawOutput: string;
  parsed: ParsedOutput;
  success: boolean;
  error: string | null;
  timing: number;
  timestamp: string;
  severity?: IncidentSeverity;
  ticket?: IncidentTicket;
}

export type ParsedOutput =
  | PingOutput
  | NetstatOutput
  | ServiceStatusOutput
  | RedisPingOutput
  | CurlOutput
  | DnsOutput
  | GenericOutput
  | TracerouteOutput;

export interface PingOutput {
  type: "ping";
  destination: string;
  packetsTransmitted: number;
  packetsReceived: number;
  packetLoss: number;
  minLatency: number | null;
  avgLatency: number | null;
  maxLatency: number | null;
  summary: string;
}

export interface TracerouteOutput {
  type: "traceroute";
  destination: string;
  hops: { hop: number; ip: string; latency: string }[];
  summary: string;
}

export interface NetstatOutput {
  type: "netstat";
  listeningPorts: { port: number; protocol: string; process: string }[];
  connections: { local: string; remote: string; state: string }[];
  summary: string;
}

export interface ServiceStatusOutput {
  type: "service-status";
  serviceName: string;
  active: boolean;
  enabled: boolean;
  status: string;
  pid: number | null;
  summary: string;
}

export interface RedisPingOutput {
  type: "redis-ping";
  response: string;
  isAlive: boolean;
  summary: string;
}

export interface CurlOutput {
  type: "curl";
  url: string;
  httpCode: number | null;
  responseTime: number | null;
  summary: string;
}

export interface DnsOutput {
  type: "dns";
  domain: string;
  resolvedIps: string[];
  summary: string;
}

export interface GenericOutput {
  type: "generic";
  raw: string;
  summary: string;
}

export interface WhitelistEntry {
  host: string;
  label: string;
  allowedCommands: CommandName[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  request: DiagnosticRequest;
  result: Pick<DiagnosticResult, "success" | "timing" | "error" | "mode">;
}

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentCategory =
  | "network"
  | "security"
  | "service"
  | "deployment"
  | "infrastructure"
  | "configuration"
  | "other";

export type TicketPriority = "P0" | "P1" | "P2" | "P3";

export interface TicketStatusHistoryEntry {
  timestamp: string;
  status: IncidentTicket["status"];
  assignee?: string;
  team?: string;
  note?: string;
}

export interface StructuredIncidentSummary {
  impact: string;
  evidence: string;
  recommendedAction: string;
  rationale: string;
}

export interface IncidentTicket {
  id: string;
  createdAt: string;
  severity: IncidentSeverity;
  status: "opened" | "assigned" | "resolved" | "closed" | "reopened";
  assignedTo: string;
  assignedTeam: string;
  incidentCategory: IncidentCategory;
  priority: TicketPriority;
  slaTarget: string;
  summary: string;
  structuredSummary: StructuredIncidentSummary;
  details: string;
  statusHistory: TicketStatusHistoryEntry[];
  updatedAt?: string;
  source?: "auto" | "manual";
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}
