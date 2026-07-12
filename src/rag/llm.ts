import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { SimpleChatModel } from "@langchain/core/language_models/chat_models";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage } from "@langchain/core/messages";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { config } from "../config.js";
import { isModelAvailable } from "./ollama.js";

/**
 * A local mock Chat Model that performs key-phrase matching on the RAG context.
 * Returns technical answers extracted directly from internal documentation.
 */
export class MockChatModel extends SimpleChatModel {
  _llmType() {
    return "mock-chat-model";
  }

  async _call(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    // 1. Extract user query
    const lastMsg = messages[messages.length - 1];
    const question = lastMsg ? String(lastMsg.content) : "";

    // 2. Extract system prompt and its embedded context
    const systemMsg = messages.find(m => m._getType() === "system");
    const systemContent = systemMsg ? String(systemMsg.content) : "";

    // 3. Extract the documentation context
    let context = "";
    const contextMarker = "Contexto de la documentación interna:";
    const markerIndex = systemContent.indexOf(contextMarker);
    if (markerIndex !== -1) {
      context = systemContent.slice(markerIndex + contextMarker.length).trim();
    } else {
      context = systemContent;
    }

    // 4. Validate context presence
    if (!context || context.trim().length === 0 || context.includes("undefined")) {
      return "No tengo información suficiente en mi base de conocimiento para responder esta consulta.";
    }

    // 5. Keywords matching to find the most relevant blocks
    const blocks = context.split(/(?:\r?\n){2,}/).map(b => b.trim()).filter(b => b.length > 0);
    const questionWords = question.toLowerCase()
      .replace(/[^a-z0-9áéíóúñ]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3);

    const matchingBlocks: { block: string; matches: number }[] = [];
    for (const block of blocks) {
      const blockLower = block.toLowerCase();
      let matchCount = 0;
      for (const word of questionWords) {
        if (blockLower.includes(word)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        matchingBlocks.push({ block, matches: matchCount });
      }
    }

    // Sort by number of matching keywords descending
    matchingBlocks.sort((a, b) => b.matches - a.matches);

    if (matchingBlocks.length > 0) {
      const bestBlocks = matchingBlocks.map(item => item.block).slice(0, 3);
      const response = bestBlocks.join("\n\n");
      return `[MODO DEMOSTRACIÓN OFFLINE]
Basado en la documentación interna de soporte:

${response}

Puedes usar esta referencia como punto de partida. Si quieres una respuesta más completa, levanta Ollama y descarga los modelos recomendados.`;
    }

    // If there is context but no specific keyword matches
    if (blocks.length > 0) {
      return `[MODO DEMOSTRACIÓN OFFLINE]
Encontré información en la base de datos de conocimiento, pero no coincide exactamente con las palabras claves de tu pregunta. Aquí hay un fragmento que podría ayudarte:

${blocks[0]}

Puedes usar este fragmento como referencia mientras activas Ollama para obtener respuestas generativas completas.`;
    }

    return "No tengo información suficiente en mi base de conocimiento para responder esta consulta.";
  }
}

/**
 * A Chat Model that connects to the Google Gemini API.
 */
export class GeminiChatModel extends SimpleChatModel {
  private apiKey: string;
  private modelName: string;

  constructor(fields: { apiKey: string; modelName?: string }) {
    super({});
    this.apiKey = fields.apiKey;
    this.modelName = fields.modelName || "gemini-3.5-flash";
  }

  _llmType() {
    return "gemini-chat-model";
  }

  async _call(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const systemMessage = messages.find(msg => msg._getType() === "system");
    const systemInstruction = systemMessage 
      ? { parts: [{ text: String(systemMessage.content) }] } 
      : undefined;

    const userModelMessages = messages.filter(msg => msg._getType() !== "system");
    const formattedContents = userModelMessages.map(msg => {
      const role = msg._getType() === "ai" ? "model" : "user";
      return {
        role: role,
        parts: [{ text: String(msg.content) }]
      };
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: formattedContents,
        systemInstruction: systemInstruction,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error("No text response returned from Gemini API");
    }

    return candidateText;
  }
}

let instance: BaseChatModel | null = null;

/**
 * Resolves the LLM chat model dynamically. Falls back to MockChatModel if Ollama
 * or the specified model is not available, allowing seamless transition when Ollama comes online.
 */
export async function getLLM(): Promise<BaseChatModel> {
  if (config.gemini.apiKey) {
    if (!(instance instanceof GeminiChatModel)) {
      instance = new GeminiChatModel({ apiKey: config.gemini.apiKey });
    }
    return instance;
  }

  const available = await isModelAvailable(config.ollama.llmModel);
  if (available) {
    if (!(instance instanceof ChatOllama)) {
      instance = new ChatOllama({
        baseUrl: config.ollama.baseUrl,
        model: config.ollama.llmModel,
        temperature: 0.1,
        numPredict: 2048,
      });
    }
    return instance;
  }
  
  // Si está offline, retornamos el MockChatModel pero NO lo guardamos en la cache global
  // para reintentar cuando Ollama vuelva a estar disponible.
  return new MockChatModel({});
}
