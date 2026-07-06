export interface QueryResult {
  answer: string;
  sources: Source[];
  timing: {
    retrieval: number;
    generation: number;
    total: number;
  };
}

export interface Source {
  content: string;
  metadata: Record<string, unknown>;
  score?: number;
}

export interface IngestResult {
  documentsLoaded: number;
  chunksCreated: number;
  collectionSize: number;
  time: number;
  sources: IngestSourceSummary[];
  coverage: IngestCoverageReport;
}

export interface IngestSourceSummary {
  path: string;
  type: "local" | "repo";
  docCount: number;
  lastIndexed: string;
}

export interface IngestCoverageReport {
  totalDocuments: number;
  indexedDocuments: number;
  missingPaths: string[];
  updatedSources: string[];
}

export interface RagStats {
  collectionSize: number;
  docsDirectory: string;
  embeddingModel: string;
  llmModel: string;
}
