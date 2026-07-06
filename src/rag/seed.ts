import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { ingest } from "./ingestion.js";

const docsDir = "./docs";

mkdirSync(docsDir, { recursive: true });

const sampleDocs: Record<string, string> = {
  "redes-topologia.md": `# Topología de Red — Oficina Principal

## Segmentos de Red
- **10.0.1.0/24** — Oficinas administrativas (VLAN 10)
- **10.0.2.0/24** — Desarrollo y servidores internos (VLAN 20)
- **10.0.3.0/24** — DMZ / Servicios expuestos (VLAN 30)

## Gateways
- VLAN 10: 10.0.1.1 (Core Switch 1)
- VLAN 20: 10.0.2.1 (Core Switch 1)
- VLAN 30: 10.0.3.1 (Firewall)

## Reglas de Firewall
- Tráfico entrante a DMZ: solo puertos 80, 443, 22 desde IPs autorizadas.
- Tráfico desde VLAN 10 a VLAN 20: permitido solo en puertos 3306 (MySQL) y 5432 (PostgreSQL).
- Todo tráfico saliente pasa por proxy corporativo 10.0.0.10:3128.

## Diagnóstico rápido
Para verificar conectividad entre segmentos:
ping -c 4 10.0.2.1    # Desde VLAN 10 hacia core
traceroute 10.0.3.1    # Traza hacia el firewall`,

  "servicios-manual.md": `# Manual de Servicios Críticos

## Servidores de Aplicación

### API Gateway (192.168.1.10)
- Puerto: 443
- Health check: GET /health
- Logs: /var/log/api-gateway/access.log

### Base de Datos Principal (192.168.1.20)
- Motor: PostgreSQL 15
- Puerto: 5432
- DB: soporte_produccion
- Backup: 03:00 UTC diario (retención 30 días)

### Redis Cache (192.168.1.30)
- Puerto: 6379
- Uso: sesiones de usuario y rate limiting

## Verificación de estado
systemctl status postgresql-15
netstat -tlnp | grep 5432
redis-cli ping
curl -k https://192.168.1.10/health

## Procedimiento de reinicio seguro
1. Notificar a usuarios con 5 min de anticipación
2. Detener tráfico en el balanceador
3. Ejecutar: sudo systemctl restart <servicio>
4. Verificar health check
5. Reabrir tráfico`,
};

console.log("Creando documentos de ejemplo...");
for (const [filename, content] of Object.entries(sampleDocs)) {
  writeFileSync(join(docsDir, filename), content.trim());
  console.log(`  ✓ ${filename}`);
}

console.log(`\n${Object.keys(sampleDocs).length} documentos creados en ${docsDir}/\n`);

try {
  const result = await ingest(docsDir, { clear: true });
  console.log("Ingesta completada:");
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error en ingesta: ${msg}`);
  console.log("\nAsegúrate de que Ollama esté corriendo:");
  console.log("  ollama pull nomic-embed-text");
  console.log("  ollama pull llama3");
}
