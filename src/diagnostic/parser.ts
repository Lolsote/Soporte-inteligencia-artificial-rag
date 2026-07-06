import type {
  ParsedOutput,
  PingOutput,
  NetstatOutput,
  ServiceStatusOutput,
  RedisPingOutput,
  CurlOutput,
  DnsOutput,
  TracerouteOutput,
  GenericOutput,
} from "./types.js";

export function parseOutput(type: string, raw: string, target?: string): ParsedOutput {
  switch (type) {
    case "ping":
      return parsePing(raw, target);
    case "traceroute":
      return parseTraceroute(raw, target);
    case "netstat":
      return parseNetstat(raw);
    case "service-status":
      return parseServiceStatus(raw, target);
    case "redis-ping":
      return parseRedisPing(raw);
    case "curl":
      return parseCurl(raw);
    case "dns":
      return parseDns(raw, target);
    default:
      return parseGeneric(raw);
  }
}

function parsePing(raw: string, destination?: string): PingOutput {
  const tx = parseInt(raw.match(/(\d+)\s+packets transmitted/)?.[1] ?? "0", 10);
  const rx = parseInt(raw.match(/(\d+)\s+(packets )?received/)?.[1] ?? "0", 10);
  const loss = parseFloat(raw.match(/([\d.]+)%\s*packet loss/)?.[1] ?? "100");
  const min = parseFloat(raw.match(/min\/avg\/max\/.*?=\s*([\d.]+)/)?.[1] ?? "NaN");
  const avg = parseFloat(raw.match(/min\/avg\/max\/.*?=\s*[\d.]+\/([\d.]+)/)?.[1] ?? "NaN");
  const max = parseFloat(raw.match(/min\/avg\/max\/.*?=\s*[\d.]+\/[\d.]+\/([\d.]+)/)?.[1] ?? "NaN");

  const summary = loss === 0
    ? `Conectividad OK con ${destination} — latencia promedio ${isNaN(avg) ? "N/A" : avg + "ms"}`
    : `${loss}% de pérdida hacia ${destination} (${rx}/${tx} paquetes)`;

  return {
    type: "ping",
    destination: destination ?? "desconocido",
    packetsTransmitted: tx,
    packetsReceived: rx,
    packetLoss: loss,
    minLatency: isNaN(min) ? null : min,
    avgLatency: isNaN(avg) ? null : avg,
    maxLatency: isNaN(max) ? null : max,
    summary,
  };
}

function parseTraceroute(raw: string, destination?: string): TracerouteOutput {
  const hops = raw
    .split("\n")
    .filter((l) => /^\s*\d+/.test(l))
    .map((l) => {
      const parts = l.trim().split(/\s+/);
      const hop = parseInt(parts[0], 10);
      const ip = parts[1] === "*" ? "*" : parts[1];
      const latency = parts[2] || "*";
      return { hop, ip, latency };
    });

  return {
    type: "traceroute",
    destination: destination ?? "desconocido",
    hops,
    summary: `${hops.length} saltos hasta ${destination}`,
  };
}

function parseNetstat(raw: string): NetstatOutput {
  const listeningPorts: { port: number; protocol: string; process: string }[] = [];
  const connections: { local: string; remote: string; state: string }[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.includes("LISTEN")) {
      const parts = trimmed.split(/\s+/);
      const local = parts[3] || "";
      const portMatch = local.match(/:(\d+)$/);
      const proto = parts[0]?.includes("tcp") ? "tcp" : "udp";
      const process = parts[parts.length - 1] || "";
      if (portMatch) {
        listeningPorts.push({ port: parseInt(portMatch[1]), protocol: proto, process });
      }
    }

    const stateMatch = trimmed.match(/^\S+\s+\S+\s+\S+\s+(\S+)\s+(\S+)\s+(\S+)/);
    if (stateMatch && stateMatch[3] && stateMatch[3] !== "LISTEN") {
      connections.push({
        local: stateMatch[1],
        remote: stateMatch[2],
        state: stateMatch[3],
      });
    }
  }

  const summary = `${listeningPorts.length} puertos en escucha, ${connections.length} conexiones activas`;
  return { type: "netstat", listeningPorts, connections, summary };
}

function parseServiceStatus(raw: string, serviceName?: string): ServiceStatusOutput {
  const active = raw.includes("Active: active") || raw.includes("active (running)");
  const enabled = raw.includes("Enabled: enabled");
  const pid = parseInt(raw.match(/Main PID: (\d+)/)?.[1] ?? "0", 10);
  const statusLine = raw.split("\n").find((l) => l.includes("Active:"))?.trim() || "";

  return {
    type: "service-status",
    serviceName: serviceName ?? "desconocido",
    active,
    enabled,
    status: statusLine || (active ? "running" : "stopped"),
    pid: pid || null,
    summary: active
      ? `${serviceName}: ACTIVO${pid ? ` (PID ${pid})` : ""}`
      : `${serviceName}: DETENIDO o NO INSTALADO`,
  };
}

function parseRedisPing(raw: string, host?: string): RedisPingOutput {
  const isAlive = raw.includes("PONG");
  return {
    type: "redis-ping",
    response: raw.trim(),
    isAlive,
    summary: isAlive
      ? `Redis responde OK en ${host ?? "desconocido"}`
      : `Redis NO responde en ${host ?? "desconocido"}: "${raw.trim()}"`,
  };
}

function parseCurl(raw: string, url?: string): CurlOutput {
  const httpCode = parseInt(raw.match(/HTTP_CODE:(\d+)/)?.[1] ?? "0", 10);
  const time = parseFloat(raw.match(/TIME:([\d.]+)/)?.[1] ?? "NaN");
  return {
    type: "curl",
    url: url ?? "desconocido",
    httpCode: httpCode || null,
    responseTime: isNaN(time) ? null : Math.round(time * 1000),
    summary: httpCode
      ? `HTTP ${httpCode} en ${isNaN(time) ? "N/A" : Math.round(time * 1000) + "ms"}`
      : `Error de conexión: "${raw.slice(0, 100)}"`,
  };
}

function parseDns(raw: string, domain?: string): DnsOutput {
  const ips = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+\.\d+\.\d+\.\d+$/.test(l) || /^[0-9a-f:]+$/.test(l));

  return {
    type: "dns",
    domain: domain ?? "desconocido",
    resolvedIps: ips,
    summary: ips.length > 0
      ? `${domain} → ${ips.join(", ")}`
      : `${domain}: sin resolución`,
  };
}

function parseGeneric(raw: string): GenericOutput {
  const lines = raw.split("\n").filter((l) => l.trim()).length;
  return {
    type: "generic",
    raw: raw.slice(0, 2000),
    summary: `${lines} líneas de salida`,
  };
}
