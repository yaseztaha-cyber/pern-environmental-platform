/**
 * PERN AI Router
 * Centralized management for AI models, caching, rate limiting, and cost tracking
 */

const aiService = require('./ai-service');
const logger = require('../utils/logger');
const crypto = require('crypto');

class AIRouter {
  constructor() {
    this.cache = new Map();           // Simple in-memory cache
    this.cacheTTL = 5 * 60 * 1000;    // 5 minutes
    this.requestCount = 0;
    this.totalTokens = 0;
    this.model = aiService.model;
  }

  /**
   * Generate cache key
   */
  getCacheKey(message, context) {
    const raw = `${message}-${JSON.stringify(context)}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  /**
   * Check cache
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.response;
  }

  /**
   * Save to cache
   */
  saveToCache(key, response) {
    this.cache.set(key, {
      response,
      timestamp: Date.now()
    });

    // Bound the cache: evict expired entries, then oldest if still over cap
    const MAX_CACHE = 500;
    if (this.cache.size > MAX_CACHE) {
      const now = Date.now();
      const expired = [];
      const entries = [];
      for (const [k, v] of this.cache) {
        if (now - v.timestamp > this.cacheTTL) expired.push(k);
        else entries.push([k, v.timestamp]);
      }
      expired.forEach(k => this.cache.delete(k));
      if (this.cache.size > MAX_CACHE) {
        entries.sort((a, b) => a[1] - b[1]);
        for (const [k] of entries.slice(0, this.cache.size - MAX_CACHE)) {
          this.cache.delete(k);
        }
      }
    }
  }

  /**
   * Main routed chat method
   */
  async chat(params) {
    const { message, context, sessionId } = params;
    this.requestCount++;

    // 1. Check cache (skip if no sessionId)
    if (!sessionId || sessionId === 'default') {
      const cacheKey = this.getCacheKey(message, context);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    // 2. Call AI Service
    try {
      const result = await aiService.chat(params);

      // 3. Cache the result
      const cacheKey = this.getCacheKey(message, context);
      this.saveToCache(cacheKey, result);

      // 4. Track usage
      this.trackUsage(result);

      return result;

    } catch (error) {
      logger.error('[AI Router]', { error: error.message });
      throw error;
    }
  }

  async chatStream(params) {
    const { message, context, sessionId } = params;
    this.requestCount++;

    const systemPrompt = aiService.buildSystemPrompt(context);
    const history = await aiService.getConversation(sessionId);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message }
    ];

    const fetch = require('node-fetch');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://pern.app',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.7,
          max_tokens: 1000,
          stream: true
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`OpenRouter HTTP ${response.status}`);
    }

    return response;
  }

  /**
   * Basic usage tracking
   */
  trackUsage(result) {
    // In production, you would track tokens and cost here
    logger.debug('[AI Router] Tracked request', { requestCount: this.requestCount, model: result.model });
  }

  /**
   * Get usage stats
   */
  getStats() {
    return {
      totalRequests: this.requestCount,
      cacheSize: this.cache.size,
      model: this.model
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  async clearConversation(sessionId) {
    await aiService.clearConversation(sessionId);
  }
}

module.exports = new AIRouter();