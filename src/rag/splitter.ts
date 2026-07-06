import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

export function createTextSplitter() {
  return new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });
}

export async function splitDocuments(docs: import("@langchain/core/documents").Document[]) {
  const splitter = createTextSplitter();
  const chunks = await splitter.splitDocuments(docs);

  for (const chunk of chunks) {
    chunk.metadata.chunkSize = CHUNK_SIZE;
    chunk.metadata.chunkOverlap = CHUNK_OVERLAP;
  }

  return chunks;
}
