import { Router, Request, Response } from "express";
import multer from "multer";
import { ingest } from "../rag/ingestion.js";
import { queryRag } from "../rag/query.js";
import { collectionSize, addDocuments, deleteCollection, getVectorStoreType } from "../rag/vectorstore.js";
import { checkOllamaServer } from "../rag/ollama.js";
import { getConversation, getMemoryStats, clearConversation } from "../rag/memory.js";
import { loadDocument } from "../rag/loader.js";
import { splitDocuments } from "../rag/splitter.js";
import { config } from "../config.js";
import { scanDocsDirectory, getSupportedExtensions } from "../rag/loader.js";
import { detectDocChanges } from "../rag/indexer.js";
import { loadPromptTemplate, savePromptTemplate, getPromptMetadata } from "../rag/prompt.js";
import { authenticate, authorizeRoles } from "./auth.js";
import { runDiagnostic } from "../diagnostic/orchestrator.js";
import { listCommands } from "../diagnostic/catalog.js";
import { listWhitelist, addWhitelistEntry, removeWhitelistEntry } from "../diagnostic/whitelist.js";
import { readAudit } from "../diagnostic/audit.js";
import { resetRateLimit } from "../diagnostic/rate-limit.js";
import {
  readTickets,
  getTicketById,
  updateTicketState,
} from "../diagnostic/escalation.js";
import type { DiagnosticRequest } from "../diagnostic/types.js";

interface AuthRequest extends Request {
  user?: { name: string; role: "level1" | "level2" | "admin" };
}

const router = Router();
const upload = multer({ dest: "uploads/" });

router.use(authenticate);

// ── RAG ──────────────────────────────────────────────────────────

router.get("/rag/health", async (_req: Request, res: Response) => {
  const ollamaOnline = config.gemini.apiKey ? false : await checkOllamaServer();
  res.json({
    status: "ok",
    service: "SoporteIA",
    version: "1.0.0",
    ollama: ollamaOnline ? "online" : "offline",
    gemini: config.gemini.apiKey ? "online" : "offline",
    vectorStore: getVectorStoreType(),
  });
});

router.get("/rag/stats", async (_req: Request, res: Response) => {
  const size = await collectionSize();
  res.json({
    collectionSize: size,
    docsDirectory: "./docs",
    supportedExtensions: getSupportedExtensions(),
    embeddingModel: config.gemini.apiKey ? "gemini-embedding-2 (Gemini Cloud)" : config.ollama.embeddingModel,
    llmModel: config.gemini.apiKey ? "gemini-2.5-flash (Gemini Cloud)" : config.ollama.llmModel,
  });
});

router.post("/rag/ingest", async (req: Request, res: Response) => {
  try {
    const docsDirsBody = req.body.docsDirs || req.body.docsDir;
    const repoUrlsBody = req.body.repoUrls || req.body.repoUrl;
    const clear = req.body.clear === true;

    const docsDirs = Array.isArray(docsDirsBody)
      ? docsDirsBody
      : typeof docsDirsBody === "string"
      ? [docsDirsBody]
      : [];

    const repoUrls = Array.isArray(repoUrlsBody)
      ? repoUrlsBody
      : typeof repoUrlsBody === "string"
      ? [repoUrlsBody]
      : [];

    const combinedDirs = [...docsDirs, ...repoUrls].filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    const result = await ingest(combinedDirs.length > 0 ? combinedDirs : ["./docs"], {
      clear,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.get("/rag/admin/index-status", (_req: Request, res: Response) => {
  try {
    const status = detectDocChanges(["./docs"]);
    res.json({
      added: status.added.map((item) => item.path),
      modified: status.modified.map((item) => item.path),
      deleted: status.deleted,
      unchanged: status.unchanged.map((item) => item.path),
      lastUpdated: status.lastUpdated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.get("/rag/admin/prompt", (_req: Request, res: Response) => {
  try {
    const template = loadPromptTemplate();
    const metadata = getPromptMetadata();
    res.json({ template, metadata });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.post("/rag/admin/prompt", (req: Request, res: Response) => {
  try {
    const template = req.body.template as string;
    if (!template || typeof template !== "string") {
      res.status(400).json({ error: "El campo 'template' es obligatorio" });
      return;
    }
    savePromptTemplate(template);
    res.json({ message: "Prompt actualizado correctamente" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.post("/rag/ingest/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No se envió ningún archivo" });
      return;
    }
    const docs = await loadDocument(req.file.path);
    const chunks = await splitDocuments(docs);
    await addDocuments(chunks);
    const size = await collectionSize();
    res.json({
      fileName: req.file.originalname,
      documentsLoaded: 1,
      chunksCreated: chunks.length,
      collectionSize: size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.post("/rag/query", async (req: Request, res: Response) => {
  try {
    const { question, k, sessionId } = req.body;
    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "El campo 'question' es obligatorio" });
      return;
    }
    const result = await queryRag(question, { k: k ?? 5, sessionId: typeof sessionId === "string" ? sessionId : undefined });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.get("/rag/memory/:sessionId", (req: Request, res: Response) => {
  try {
    const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
    res.json({ sessionId, history: getConversation(sessionId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.get("/rag/memory", (_req: Request, res: Response) => {
  try {
    res.json(getMemoryStats());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.delete("/rag/memory/:sessionId", (req: Request, res: Response) => {
  try {
    const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
    clearConversation(sessionId);
    res.json({ message: `Memoria limpiada para ${sessionId}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.post("/rag/collection/clear", async (_req: Request, res: Response) => {
  try {
    await deleteCollection();
    res.json({ message: "Colección eliminada correctamente" });
  } catch (err) {
    const message = err instanceof Error ? err instanceof Error ? err.message : "Error desconocido" : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.get("/rag/docs/list", (_req: Request, res: Response) => {
  try {
    const files = scanDocsDirectory("./docs", true);
    res.json({ files, count: files.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

// ── DIAGNÓSTICO REMOTO ────────────────────────────────────────────

router.get("/diagnostic/catalog", (_req: Request, res: Response) => {
  res.json({ commands: listCommands() });
});

router.post(
  "/diagnostic/execute",
  authorizeRoles(["level1", "level2", "admin"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as DiagnosticRequest;
      if (!body.command) {
        res.status(400).json({ error: "El campo 'command' es obligatorio" });
        return;
      }
      const userId = req.user?.name || "anonymous";
      const result = await runDiagnostic(body, userId);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      res.status(500).json({ error: message });
    }
  },
);

router.get("/diagnostic/whitelist", (_req: Request, res: Response) => {
  res.json({ entries: listWhitelist() });
});

router.post("/diagnostic/whitelist", (req: Request, res: Response) => {
  try {
    const { host, label, allowedCommands } = req.body;
    if (!host) {
      res.status(400).json({ error: "El campo 'host' es obligatorio" });
      return;
    }
    addWhitelistEntry({ host, label: label || host, allowedCommands: allowedCommands || [] });
    res.json({ message: `Host '${host}' agregado a la lista blanca` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.delete("/diagnostic/whitelist/:host", (req: Request, res: Response) => {
  try {
    const host = String(req.params.host);
    const removed = removeWhitelistEntry(host);
    if (removed) {
      res.json({ message: `Host '${host}' eliminado` });
    } else {
      res.status(404).json({ error: `Host '${host}' no encontrado` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    res.status(500).json({ error: message });
  }
});

router.get("/diagnostic/audit", (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
  res.json({ entries: readAudit(limit, offset) });
});

router.get(
  "/diagnostic/tickets",
  authorizeRoles(["level1", "level2", "admin"]),
  (req: Request, res: Response) => {
    const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    res.json({ tickets: readTickets(limit, offset) });
  },
);

router.get(
  "/diagnostic/tickets/:id",
  authorizeRoles(["level1", "level2", "admin"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const ticket = await getTicketById(String(req.params.id));
      if (!ticket) {
        res.status(404).json({ error: "Ticket no encontrado" });
        return;
      }
      res.json({ ticket });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      res.status(500).json({ error: message });
    }
  },
);

router.patch(
  "/diagnostic/tickets/:id/state",
  authorizeRoles(["level2", "admin"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const state = String(req.body.state || "").trim();
      const assignee = String(req.body.assignee || "").trim() || undefined;
      if (!state) {
        res.status(400).json({ error: "El campo 'state' es obligatorio" });
        return;
      }
      const ticket = await updateTicketState(String(req.params.id), state, assignee);
      if (!ticket) {
        res.status(404).json({ error: "Ticket no encontrado" });
        return;
      }
      res.json({ ticket });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      res.status(500).json({ error: message });
    }
  },
);

router.post("/diagnostic/rate-limit/reset", (req: AuthRequest, res: Response) => {
  const userId = req.user?.name || "anonymous";
  resetRateLimit(userId);
  res.json({ message: `Rate limit reset para ${userId}` });
});

export default router;
