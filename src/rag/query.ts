import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getLLM } from "./llm.js";
import { similaritySearch } from "./vectorstore.js";
import { loadPromptTemplate } from "./prompt.js";
import { appendConversationMessage, getConversation } from "./memory.js";
import type { QueryResult, Source } from "./types.js";
import { createTicketFromChat } from "../diagnostic/escalation.js";
import type { IncidentCategory } from "../diagnostic/types.js";

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

  let answer = await chain.invoke({
    context: `${context}\n\nHistorial reciente:\n${history}`,
    question,
  });

  const escalationRegex = /\[ESCALAR:\s*(security|deployment|network|infrastructure|service)\]/i;
  const match = answer.match(escalationRegex);
  if (match) {
    const category = match[1].toLowerCase() as IncidentCategory;
    try {
      const ticket = await createTicketFromChat(sessionId, question, category);

      answer = answer.replace(escalationRegex, "").trim();

      let categoryLabel = "";
      if (category === "security") categoryLabel = "Seguridad de Red";
      else if (category === "deployment") categoryLabel = "Fallo de Despliegue";
      else if (category === "network") categoryLabel = "Infraestructura de Red (Telecomunicaciones)";
      else if (category === "infrastructure") categoryLabel = "Infraestructura General";
      else categoryLabel = "Operaciones de Servicio (Soporte TI)";

      answer += `\n\n⚠️ **Escalamiento Híbrido Inteligente (Nivel 3):** He detectado un incidente crítico de tipo **${categoryLabel}**. He generado automáticamente el ticket de soporte **#${ticket.id}** y lo he asignado al **${ticket.assignedTeam}** (${ticket.assignedTo}) para su resolución prioritaria.`;
    } catch (err) {
      console.error("Error creating auto-escalation ticket from chat:", err);
    }
  }

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
