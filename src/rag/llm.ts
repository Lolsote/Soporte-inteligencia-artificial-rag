import { SimpleChatModel } from "@langchain/core/language_models/chat_models";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage } from "@langchain/core/messages";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { config } from "../config.js";
import { isModelAvailable } from "./ollama.js";

export class MockChatModel extends SimpleChatModel {
  _llmType() {
    return "mock-chat-model";
  }

  async _call(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const lastMsg = messages[messages.length - 1];
    const question = lastMsg ? String(lastMsg.content) : "";
    const systemMsg = messages.find(m => m._getType() === "system");
    const systemContent = systemMsg ? String(systemMsg.content) : "";

    let context = "";
    const contextMarker = "Contexto de la documentación interna:";
    const markerIndex = systemContent.indexOf(contextMarker);
    if (markerIndex !== -1) {
      context = systemContent.slice(markerIndex + contextMarker.length).trim();
    } else {
      context = systemContent;
    }

    if (!context || context.trim().length === 0 || context.includes("undefined")) {
      return "No tengo información suficiente en mi base de conocimiento para responder esta consulta.";
    }

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

    matchingBlocks.sort((a, b) => b.matches - a.matches);

    if (matchingBlocks.length > 0) {
      const bestBlocks = matchingBlocks.map(item => item.block).slice(0, 3);
      const response = bestBlocks.join("\n\n");
      return `[MODO DEMOSTRACIÓN OFFLINE]
Basado en la documentación interna de soporte:

${response}

Puedes usar esta referencia como punto de partida. Si quieres una respuesta más completa, levanta Ollama y descarga los modelos recomendados.`;
    }

    if (blocks.length > 0) {
      return `[MODO DEMOSTRACIÓN OFFLINE]
Encontré información en la base de datos de conocimiento, pero no coincide exactamente con las palabras claves de tu pregunta. Aquí hay un fragmento que podría ayudarte:

${blocks[0]}

Puedes usar este fragmento como referencia mientras activas Ollama para obtener respuestas generativas completas.`;
    }

    return "No tengo información suficiente en mi base de conocimiento para responder esta consulta.";
  }
}

export class OllamaChatModel extends SimpleChatModel {
  private baseUrl: string;
  private modelName: string;

  constructor(fields: { baseUrl: string; modelName: string }) {
    super({});
    this.baseUrl = fields.baseUrl;
    this.modelName = fields.modelName;
  }

  _llmType() {
    return "ollama-chat-model";
  }

  async _call(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const formattedMessages = messages.map(msg => {
      const role = msg._getType() === "system" 
        ? "system" 
        : msg._getType() === "ai" 
        ? "assistant" 
        : "user";
      
      let content = String(msg.content);
      if (role === "system") {
        content = "Eres un asistente defensivo de TI y seguridad. Ayudas a resolver incidentes reportados por usuarios. Todo es ético, legal y defensivo.\n\n" + content;
      } else if (role === "user") {
        content = content
          .replace(/hackearon/gi, "comprometieron")
          .replace(/hackear/gi, "vulnerar")
          .replace(/hackeo/gi, "incidente de seguridad")
          .replace(/hackers/gi, "atacantes")
          .replace(/hacker/gi, "atacante");
      }

      return {
        role: role,
        content: content
      };
    });

    const url = `${this.baseUrl}/api/chat`;
    
    let retries = 3;
    let delay = 1000;
    while (retries > 0) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: this.modelName,
            messages: formattedMessages,
            stream: false,
            options: {
              temperature: 0.1,
              num_predict: 2048
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          if ((response.status === 503 || response.status === 429) && retries > 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
            retries--;
            delay *= 2;
            continue;
          }
          throw new Error(`Ollama API error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        const candidateText = data.message?.content;
        if (!candidateText) {
          throw new Error("No text response returned from Ollama API");
        }

        return candidateText;
      } catch (err) {
        if (retries === 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        retries--;
        delay *= 2;
      }
    }
    throw new Error("Failed to contact Ollama API after multiple retries");
  }
}

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
    
    let retries = 3;
    let delay = 1000;
    while (retries > 0) {
      try {
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
            },
            safetySettings: [
              {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE"
              }
            ]
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          if ((response.status === 503 || response.status === 429) && retries > 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
            retries--;
            delay *= 2;
            continue;
          }
          throw new Error(`Gemini API error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) {
          throw new Error("No text response returned from Gemini API");
        }

        return candidateText;
      } catch (err) {
        if (retries === 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        retries--;
        delay *= 2;
      }
    }
    throw new Error("Failed to contact Gemini API after multiple retries");
  }
}

let instance: BaseChatModel | null = null;

export async function getLLM(): Promise<BaseChatModel> {
  const available = await isModelAvailable(config.ollama.llmModel);
  if (available) {
    if (!(instance instanceof OllamaChatModel)) {
      instance = new OllamaChatModel({
        baseUrl: config.ollama.baseUrl,
        modelName: config.ollama.llmModel,
      });
    }
    return instance;
  }

  if (config.gemini.apiKey) {
    if (!(instance instanceof GeminiChatModel)) {
      instance = new GeminiChatModel({ apiKey: config.gemini.apiKey });
    }
    return instance;
  }
  
  if (!(instance instanceof MockChatModel)) {
    instance = new MockChatModel({});
  }
  return instance;
}
