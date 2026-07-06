import { existsSync } from "fs";
import { scanDocumentsInPaths, loadDocument } from "./loader.js";
import { splitDocuments } from "./splitter.js";
import { addDocuments, collectionSize, deleteCollection } from "./vectorstore.js";
import { detectDocChanges, saveIndexState } from "./indexer.js";
import type { IngestResult, IngestSourceSummary } from "./types.js";

export async function ingest(
  docsDirs?: string[],
  options: { clear?: boolean } = {}
): Promise<IngestResult> {
  const dirs = docsDirs && docsDirs.length > 0 ? docsDirs : ["./docs"];
  const t0 = performance.now();

  if (options.clear) {
    await deleteCollection();
  }

  const changes = detectDocChanges(dirs);
  const filesToIngest = [...changes.added, ...changes.modified].map((file) => file.path);

  const sourceSummaries: IngestSourceSummary[] = dirs.map((path) => ({
    path,
    type: "local",
    docCount: scanDocumentsInPaths([path]).length,
    lastIndexed: new Date().toISOString(),
  }));

  if (filesToIngest.length === 0) {
    return {
      documentsLoaded: 0,
      chunksCreated: 0,
      collectionSize: await collectionSize(),
      time: Math.round(performance.now() - t0),
      sources: sourceSummaries,
      coverage: {
        totalDocuments: scanDocumentsInPaths(dirs).length,
        indexedDocuments: 0,
        missingPaths: [],
        updatedSources: dirs,
      },
    };
  }

  const allDocs = [];
  let loaded = 0;

  for (const file of filesToIngest) {
    try {
      const docs = await loadDocument(file);
      allDocs.push(...docs);
      loaded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Error al procesar ${file}: ${msg}`);
    }
  }

  if (allDocs.length === 0) {
    return {
      documentsLoaded: 0,
      chunksCreated: 0,
      collectionSize: await collectionSize(),
      time: Math.round(performance.now() - t0),
      sources: sourceSummaries,
      coverage: {
        totalDocuments: scanDocumentsInPaths(dirs).length,
        indexedDocuments: 0,
        missingPaths: filesToIngest,
        updatedSources: dirs,
      },
    };
  }

  const chunks = await splitDocuments(allDocs);
  await addDocuments(chunks);

  saveIndexState(
    changes.current,
  );

  const size = await collectionSize();
  const t1 = performance.now();

  return {
    documentsLoaded: loaded,
    chunksCreated: chunks.length,
    collectionSize: size,
    time: Math.round(t1 - t0),
    sources: sourceSummaries,
    coverage: {
      totalDocuments: scanDocumentsInPaths(dirs).length,
      indexedDocuments: loaded,
      missingPaths: scanDocumentsInPaths(dirs).filter((path) => !filesToIngest.includes(path)),
      updatedSources: dirs,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const clear = args.includes("--clear");
  const dirs = args.filter((arg) => arg !== "--clear");
  const result = await ingest(dirs, { clear });
  console.log(JSON.stringify(result, null, 2));
}

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("ingestion-v2.ts") ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("ingestion-v2.js");

if (isMain) {
  main();
}
