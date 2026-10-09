/*
  Optional AI provider integration.

  Echo talks to any "OpenAI-compatible" HTTP API, which covers OpenAI,
  Groq, OpenRouter, Google Gemini (OpenAI compatibility endpoint),
  Anthropic (OpenAI SDK compatibility endpoint) and local Ollama.
  Three capabilities are configured independently in .env:

    AI_CHAT_*        answers in Ask Echo, summaries and tag suggestions
    AI_EMBEDDING_*   vectors for semantic search
    AI_TRANSCRIBE_*  speech-to-text for voice memories

  If a capability is not configured, the feature falls back honestly
  (keyword search instead of AI answers, manual transcript entry, ...).
  API keys stay on the server and are never sent to the browser or logged.
*/
const { config } = require("../config/env");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

function features() {
  return {
    chat: config.ai.chat.enabled,
    embeddings: config.ai.embedding.enabled,
    transcription: config.ai.transcribe.enabled,
  };
}

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

async function call(block, path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  const headers = { ...(init.headers || {}) };
  if (block.apiKey) headers.Authorization = `Bearer ${block.apiKey}`;

  let response;
  try {
    response = await fetch(`${block.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
  } catch (error) {
    throw new ProviderError(error.name === "AbortError" ? "The AI provider took too long to respond." : "Could not reach the AI provider.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Log the status only — provider error bodies can echo our prompt back.
    logger.warn("ai_provider_error", { path, status: response.status, model: block.model });
    const message =
      response.status === 401 || response.status === 403
        ? "The AI provider rejected Echo's API key. Check the server configuration."
        : response.status === 429
          ? "The AI provider is rate-limiting requests right now. Please try again shortly."
          : `The AI provider returned an error (${response.status}).`;
    throw new ProviderError(message, response.status);
  }
  return response.json();
}

/*
  chat([{role, content}], { json: true }) -> string
*/
async function chat(messages, { json = false, maxTokens = 700, temperature = 0.2 } = {}) {
  const block = config.ai.chat;
  if (!block.enabled) throw new AppError(503, "AI answers are not configured on this server.");
  const body = {
    model: block.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: "json_object" };

  let data;
  try {
    data = await call(block, "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Some compatible providers don't support response_format; retry without it once.
    if (json && error instanceof ProviderError && error.status === 400) {
      delete body.response_format;
      data = await call(block, "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      throw error;
    }
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new ProviderError("The AI provider returned an empty answer.");
  return content;
}

/*
  embed(["text", ...]) -> number[][]
*/
async function embed(texts) {
  const block = config.ai.embedding;
  if (!block.enabled) throw new AppError(503, "Semantic search is not configured on this server.");
  const data = await call(block, "/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: block.model, input: texts }),
  });
  const rows = Array.isArray(data?.data) ? [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) : [];
  if (rows.length !== texts.length) throw new ProviderError("The embedding provider returned an unexpected response.");
  return rows.map((row) => row.embedding);
}

/*
  transcribe(buffer, mimeType) -> string
*/
async function transcribe(buffer, mimeType) {
  const block = config.ai.transcribe;
  if (!block.enabled) throw new AppError(503, "Transcription is not configured on this server.");
  const extension = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/flac": "flac",
  }[mimeType] || "webm";

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), `memory.${extension}`);
  form.append("model", block.model);
  form.append("response_format", "json");

  const data = await call(block, "/audio/transcriptions", { method: "POST", body: form });
  return String(data?.text || "").trim();
}

/* Pulls the first JSON object out of a model reply (tolerates ```json fences). */
function parseJsonReply(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = {
  features,
  chat,
  embed,
  transcribe,
  parseJsonReply,
  ProviderError,
};
