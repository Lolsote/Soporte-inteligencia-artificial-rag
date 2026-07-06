import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import routes from "./api/routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.resolve(__dirname, "../public")));
app.use("/api", routes);

app.get("/", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "../public/index.html"));
});

app.get("/soporteia-maqueta.html", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "../../soporteia-maqueta.html"));
});

app.listen(config.server.port, () => {
  console.log(`\n  SoporteIA corriendo en http://localhost:${config.server.port}`);
  console.log(`\n  ── RAG ──────────────────────────────────`);
  console.log(`  GET  /api/rag/health            Health check`);
  console.log(`  GET  /api/rag/stats             Estadísticas del motor RAG`);
  console.log(
    `  POST /api/rag/ingest            Ingestar documentos y repositorios (body: { docsDir?, repoUrls?, clear? })`,
  );
  console.log(`  POST /api/rag/ingest/upload     Subir y procesar un archivo`);
  console.log(`  POST /api/rag/query             Consultar (body: { question, k? })`);
  console.log(`  POST /api/rag/collection/clear  Limpiar colección`);
  console.log(`  GET  /api/rag/docs/list         Listar documentos en ./docs`);
  console.log(`\n  ── DIAGNÓSTICO REMOTO ────────────────────`);
  console.log(`  GET  /api/diagnostic/catalog          Catálogo de comandos`);
  console.log(`  POST /api/diagnostic/execute          Ejecutar diagnóstico`);
  console.log(`  GET  /api/diagnostic/whitelist        Lista blanca de hosts`);
  console.log(`  POST /api/diagnostic/whitelist        Agregar host a lista blanca`);
  console.log(`  DELETE /api/diagnostic/whitelist/:host Eliminar host de lista blanca`);
  console.log(`  GET  /api/diagnostic/audit            Auditoría de ejecuciones`);
  console.log(`  POST /api/diagnostic/rate-limit/reset Resetear rate limit\n`);
});
