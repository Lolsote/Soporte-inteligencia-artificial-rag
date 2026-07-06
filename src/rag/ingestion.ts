import { scanDocumentsInPaths, loadDocument } from "./loader.js";
import { splitDocuments } from "./splitter.js";
import { addDocuments, collectionSize, deleteCollection } from "./vectorstore.js";
import { detectDocChanges, saveIndexState, clearIndexState, createIndexState } from "./indexer.js";
import { prepareRepos } from "./git.js";
import type { IngestResult, IngestSourceSummary } from "./types.js";

export async function ingest(
  docsDirs?: string | string[],
  options: { clear?: boolean } = {}
): Promise<IngestResult> {
  const dirs = Array.isArray(docsDirs)
    ? docsDirs.length > 0
      ? docsDirs
      : ["./docs"]
    : docsDirs
    ? [docsDirs]
    : ["./docs"];
  const t0 = performance.now();

  const repoUrls = dirs.filter((item) => item.startsWith("http://") || item.startsWith("https://") || item.endsWith(".git"));
  const localPaths = dirs.filter((item) => !repoUrls.includes(item));

  const repoPaths = await prepareRepos(repoUrls);
  const watchDirs = [...localPaths, ...repoPaths];

  if (options.clear) {
    await deleteCollection();
    clearIndexState();
  }

  const changes = detectDocChanges(watchDirs);
  let targetFiles = [...changes.added, ...changes.modified].map((file) => file.path);

  if (options.clear || changes.deleted.length > 0) {
    targetFiles = scanDocumentsInPaths(watchDirs);
  }

  const sourceSummaries: IngestSourceSummary[] = watchDirs.map((sourcePath) => ({
    path: sourcePath,
    type: repoPaths.includes(sourcePath) ? "repo" : "local",
    docCount: 0,
    lastIndexed: new Date().toISOString(),
  }));

  if (targetFiles.length === 0) {
    return {
      documentsLoaded: 0,
      chunksCreated: 0,
      collectionSize: await collectionSize(),
      time: Math.round(performance.now() - t0),
      sources: sourceSummaries,
      coverage: {
        totalDocuments: scanDocumentsInPaths(watchDirs).length,
        indexedDocuments: 0,
        missingPaths: [],
        updatedSources: watchDirs,
      },
    };
  }

  const allDocs = [];
  let loaded = 0;

  for (const file of targetFiles) {
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
        totalDocuments: scanDocumentsInPaths(watchDirs).length,
        indexedDocuments: 0,
        missingPaths: targetFiles,
        updatedSources: watchDirs,
      },
    };
  }

  const chunks = await splitDocuments(allDocs);
  await addDocuments(chunks);

  saveIndexState(createIndexState(dirs));

  const sourceCounts: IngestSourceSummary[] = sourceSummaries.map((summary) => ({
    ...summary,
    docCount: scanDocumentsInPaths([summary.path]).length,
  }));
  const indexedDocs = loaded;
  const totalDocs = scanDocumentsInPaths(watchDirs).length;

  const size = await collectionSize();
  const t1 = performance.now();

  return {
    documentsLoaded: loaded,
    chunksCreated: chunks.length,
    collectionSize: size,
    time: Math.round(t1 - t0),
    sources: sourceCounts,
    coverage: {
      totalDocuments: totalDocs,
      indexedDocuments: indexedDocs,
      missingPaths: scanDocumentsInPaths(watchDirs).filter((path) => !targetFiles.includes(path)),
      updatedSources: watchDirs,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const clear = args.includes("--clear");
  const dirs = args.filter((arg) => arg !== "--clear");
  const result = await ingest(dirs.length > 0 ? dirs : ["./docs"], { clear });
  console.log(JSON.stringify(result, null, 2));
}

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("ingestion.ts") ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("ingestion.js");

if (isMain) {
  main();
}
