/**
 * PERN Unified LLM Client
 * Single shared OpenRouter caller for every AI analysis service.
 * Provides: retry with backoff + jitter, timeout, robust JSON extraction,
 * token/latency telemetry, and consistent error classification.
 */

const fetch = require('node-fetch');
const logger = require('../utils/logger');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.AI_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const telemetry = {
  calls: 0,
  errors: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalLatencyMs: 0,
  lastError: null,
  lastModel: MODEL,
};

async function retryFetch(url, options, retries = 3, baseDelay = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || attempt === retries) return response;
      if (response.status === 429 || response.status >= 500) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 300;
        logger.warn(`[LLM] HTTP ${response.status}, retry ${attempt}/${retries} in ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 300;
      logger.warn(`[LLM] Network error, retry ${attempt}/${retries}: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('LLM request failed after retries');
}

/**
 * Extract the first JSON object from a model response.
 * Handles plain JSON, fenced ```json blocks, and leading prose.
 */
function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  // Direct parse first (also covers fenced responses after stripping fences).
  try { return JSON.parse(trimmed); } catch { /* continue */ }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ }
  }

  // Balanced-brace scan — first occurrence at depth 0.
  let depth = 0;
  let start = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try { return JSON.parse(trimmed.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * Call the LLM with a system + user prompt.
 * @param {{ system: string, user: string, temperature?: number, maxTokens?: number }} opts
 * @returns {Promise<{ content: string|null, error: string|null, model: string, usage: object|null, latencyMs: number }>}
 */
async function callLLM({ system, user, temperature = 0.2, maxTokens = 800 }) {
  const started = Date.now();
  if (!OPENROUTER_API_KEY) {
    return { content: null, error: 'LLM unavailable — OPENROUTER_API_KEY not configured', model: MODEL, usage: null, latencyMs: Date.now() - started };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await retryFetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://pern.app',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || null;
    const latencyMs = Date.now() - started;

    telemetry.calls++;
    telemetry.lastModel = data.model || MODEL;
    if (usage) {
      telemetry.promptTokens += usage.prompt_tokens || 0;
      telemetry.completionTokens += usage.completion_tokens || 0;
    }
    telemetry.totalLatencyMs += latencyMs;

    return { content, error: null, model: data.model || MODEL, usage, latencyMs };
  } catch (err) {
    telemetry.errors++;
    telemetry.lastError = err.message;
    logger.warn(`[LLM] Call failed: ${err.message}`);
    return { content: null, error: err.message, model: MODEL, usage: null, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

/** Structured result: parse JSON from the LLM and fall back to deterministic defaults when unavailable. */
async function callJSON(opts) {
  const result = await callLLM(opts);
  if (result.error || !result.content) {
    return { data: null, meta: result };
  }
  return { data: extractJSON(result.content), meta: result };
}

function getUsage() {
  return {
    calls: telemetry.calls,
    errors: telemetry.errors,
    promptTokens: telemetry.promptTokens,
    completionTokens: telemetry.completionTokens,
    avgLatencyMs: telemetry.calls ? Math.round(telemetry.totalLatencyMs / telemetry.calls) : 0,
    lastError: telemetry.lastError,
    model: telemetry.lastModel,
  };
}

module.exports = {
  callLLM,
  callJSON,
  extractJSON,
  getUsage,
  MODEL,
  configured: !!OPENROUTER_API_KEY,
};
