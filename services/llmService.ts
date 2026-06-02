import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

export type LLMProvider = "gemini" | "openai" | "anthropic" | "openai_compatible";

interface LLMInfo {
  provider: LLMProvider;
  model: string;
}

let geminiClient: GoogleGenAI | null = null;

const getEnv = (key: string): string => {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
};

const getProvider = (): LLMProvider => {
  const provider = getEnv("VITE_LLM_PROVIDER").toLowerCase();
  if (provider === "openai" || provider === "anthropic" || provider === "openai_compatible") {
    return provider;
  }
  return "gemini";
};

const getLLMInfo = (): LLMInfo => {
  const provider = getProvider();
  switch (provider) {
    case "openai":
      return { provider, model: getEnv("VITE_OPENAI_MODEL") || "gpt-4.1-mini" };
    case "anthropic":
      return { provider, model: getEnv("VITE_ANTHROPIC_MODEL") || "claude-3-5-sonnet-latest" };
    case "openai_compatible":
      return { provider, model: getEnv("VITE_OPENAI_COMPAT_MODEL") || "llama-3.1-70b-instruct" };
    default:
      return { provider: "gemini", model: getEnv("VITE_GEMINI_MODEL") || "gemini-2.5-flash" };
  }
};

const buildPrompt = (message: string, contextData?: string): string => {
  if (!contextData) {
    return message;
  }
  return `
[CONTEXT DATA]
${contextData}
[END CONTEXT]

User Query: ${message}
`;
};

const getGeminiClient = (): GoogleGenAI => {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: getEnv("VITE_GEMINI_API_KEY") });
  }
  return geminiClient;
};

const askGemini = async (prompt: string, model: string): Promise<string> => {
  const apiKey = getEnv("VITE_GEMINI_API_KEY");
  if (!apiKey) {
    return "Error: Missing VITE_GEMINI_API_KEY.";
  }
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });
  return response.text || "No text response returned by Gemini.";
};

const askOpenAICompat = async (
  prompt: string,
  model: string,
  apiKey: string,
  baseUrl: string
): Promise<string> => {
  if (!apiKey) {
    return "Error: Missing API key for OpenAI-compatible provider.";
  }
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return `Error: OpenAI-compatible API request failed (${response.status}). ${detail.slice(0, 240)}`;
  }

  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content || "No text response returned by OpenAI-compatible API.";
};

const askAnthropic = async (prompt: string, model: string): Promise<string> => {
  const apiKey = getEnv("VITE_ANTHROPIC_API_KEY");
  if (!apiKey) {
    return "Error: Missing VITE_ANTHROPIC_API_KEY.";
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Required for direct browser-to-Anthropic calls; without it the request
      // is blocked by CORS. Note this exposes the API key client-side (see README).
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_INSTRUCTION,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return `Error: Anthropic API request failed (${response.status}). ${detail.slice(0, 240)}`;
  }

  const payload = await response.json();
  return payload?.content?.[0]?.text || "No text response returned by Anthropic.";
};

export const sendMessageToLLM = async (message: string, contextData?: string): Promise<string> => {
  try {
    const { provider, model } = getLLMInfo();
    const prompt = buildPrompt(message, contextData);

    if (provider === "openai") {
      return askOpenAICompat(prompt, model, getEnv("VITE_OPENAI_API_KEY"), "https://api.openai.com/v1");
    }

    if (provider === "anthropic") {
      return askAnthropic(prompt, model);
    }

    if (provider === "openai_compatible") {
      const baseUrl = getEnv("VITE_OPENAI_COMPAT_BASE_URL") || "http://localhost:11434/v1";
      return askOpenAICompat(prompt, model, getEnv("VITE_OPENAI_COMPAT_API_KEY"), baseUrl);
    }

    return askGemini(prompt, model);
  } catch (error) {
    console.error("LLM API Error:", error);
    return "Error: Unable to connect to the selected LLM provider. Check provider/API key/network settings.";
  }
};

export const getActiveLLMInfo = (): LLMInfo => getLLMInfo();
