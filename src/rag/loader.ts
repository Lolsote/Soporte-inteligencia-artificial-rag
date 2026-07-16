import { readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

const EXTENSION_MAP: Record<string, string> = {
  ".md": "markdown",
  ".txt": "texto",
  ".html": "html",
  ".htm": "html",
  ".pdf": "pdf",
  ".conf": "configuracion",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".ini": "configuracion",
  ".env": "configuracion",
  ".sh": "script",
  ".bash": "script",
  ".js": "codigo",
  ".ts": "codigo",
  ".py": "codigo",
};

export function scanDocsDirectory(dir: string, recursive = false): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const ext = extname(entry).toLowerCase();

    if (statSync(fullPath).isFile() && EXTENSION_MAP[ext]) {
      files.push(fullPath);
      continue;
    }

    if (recursive && statSync(fullPath).isDirectory()) {
      files.push(...scanDocsDirectory(fullPath, true));
    }
  }

  return files;
}

export function scanDocumentsInPaths(paths: string[]): string[] {
  const files: string[] = [];
  for (const path of paths) {
    try {
      files.push(...scanDocsDirectory(path, true));
    } catch {
    }
  }
  return Array.from(new Set(files));
}

export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_MAP);
}

export function getExtensionLabel(ext: string): string {
  return EXTENSION_MAP[ext.toLowerCase()] || "desconocido";
}

export async function loadDocument(filePath: string) {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf": {
      const loader = new PDFLoader(filePath, {
        splitPages: true,
        parsedItemSeparator: "\n",
      });
      return loader.load();
    }
    default: {
      const loader = new TextLoader(filePath);
      return loader.load();
    }
  }
}
