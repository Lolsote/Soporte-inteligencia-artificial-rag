import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getLLM } from "./llm.js";
import { similaritySearch } from "./vectorstore.js";
import { loadPromptTemplate } from "./prompt.js";
import { appendConversationMessage, getConversation } from "./memory.js";
import type { QueryResult, Source } from "./types.js";

export async function queryRag(
  question: string,
  options: { k?: number; sessionId?: string } = {}
): Promise<QueryResult> {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", loadPromptTemplate()],
    ["human", "{question}"],
  ]);
  const k = options.k ?? 5;
  const sessionId = options.sessionId || "default";
  const t0 = performance.now();

  const history = getConversation(sessionId)
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "Usuario" : "Asistente"}: ${turn.content}`)
    .join("\n");

  const results = await similaritySearch(question, k);

  const t1 = performance.now();

  const context = results
    .map(([doc], i) => `[Fuente ${i + 1}] ${doc.pageContent}`)
    .join("\n\n");

  const sources: Source[] = results.map(([doc, score]) => ({
    content: doc.pageContent.slice(0, 300),
    metadata: doc.metadata,
    score,
  }));

  const llm = await getLLM();
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const answer = await chain.invoke({
    context: `${context}\n\nHistorial reciente:\n${history}`,
    question,
  });

  appendConversationMessage(sessionId, "user", question);
  appendConversationMessage(sessionId, "assistant", answer);

  const t2 = performance.now();

  return {
    answer,
    sources,
    timing: {
      retrieval: Math.round(t1 - t0),
      generation: Math.round(t2 - t1),
      total: Math.round(t2 - t0),
    },
  };
}
