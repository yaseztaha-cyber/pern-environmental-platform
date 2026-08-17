/**
 * PERN Chatbot Route - Powered by Advanced AI Service
 * Supports both regular JSON responses and SSE streaming
 */

const express = require('express');
const router = express.Router();
const aiRouter = require('../services/ai-router');
const aiCopilot = require('../services/ai-copilot');
const conversationMemory = require('../services/conversation-memory');
const rateLimiter = require('../middleware/rate-limiter');
const logger = require('../utils/logger');
const crypto = require('crypto');

router.use('/chat', rateLimiter(60000, 30));

// Ground the chatbot with live platform data (best-effort, never blocks).
async function withLiveContext(context) {
  try {
    const live = await aiCopilot.buildLiveContext(context || {});
    return { ...(context || {}), ...live };
  } catch {
    return context || {};
  }
}

// Regular (non-streaming) chat
router.post('/chat', async (req, res) => {
  const { message, context, sessionId } = req.body || {};
  const trimmed = (message || '').trim();
  try {

    if (!trimmed) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (trimmed.length > 10000) {
      return res.status(400).json({ error: 'Message too long (max 10,000 characters)' });
    }

    const sid = sessionId || crypto.randomUUID();

    // Auto-create conversation if new
    if (sessionId && (await conversationMemory.getHistory(sessionId, 1)).length === 0) {
      const title = conversationMemory.generateTitle(trimmed);
      await conversationMemory.create(title, 'anonymous', 'default', undefined, sessionId);
    }

    const enrichedContext = await withLiveContext(context || {});
    const result = await aiRouter.chat({
      message: trimmed,
      context: enrichedContext,
      sessionId: sid
    });

    res.json({ ...result, sessionId: sid });

  } catch (error) {
    logger.error('[Chatbot Route]', { error: error.message });
    const fallbackContext = await withLiveContext(context || {});
    const fallbackReply = generateFallbackReply(trimmed || '', fallbackContext);
    res.json({
      response: fallbackReply,
      model: 'fallback',
      conversationLength: 0,
      toolUsed: false
    });
  }
});

// SSE Streaming chat
router.post('/stream', rateLimiter(60000, 15), async (req, res) => {
  const { message, context, sessionId, conversationId } = req.body || {};
  const trimmed = (message || '').trim();
  try {

    if (!trimmed) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (trimmed.length > 10000) {
      return res.status(400).json({ error: 'Message too long' });
    }

    const sid = sessionId || conversationId || crypto.randomUUID();

    // Auto-create conversation if new
    if ((await conversationMemory.getHistory(sid, 1)).length === 0) {
      const title = conversationMemory.generateTitle(trimmed);
      await conversationMemory.create(title, 'anonymous', 'default', undefined, sid);
    }

    // Save user message early so a crash still records intent
    await conversationMemory.saveMessage(sid, 'user', trimmed, undefined, 0);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    res.write(`data: ${JSON.stringify({ type: 'start', sessionId: sid, conversationId: sid })}\n\n`);

    try {
      const stream = await aiRouter.chatStream({
        message: trimmed,
        context: await withLiveContext(context || {}),
        sessionId: sid
      });

      let fullResponse = '';
      const reader = stream.body;
      
      for await (const chunk of reader) {
        const text = chunk.toString();
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }

      // Save assistant message
      await conversationMemory.saveMessage(sid, 'assistant', fullResponse, aiRouter.model);

      res.write(`data: ${JSON.stringify({ type: 'done', model: aiRouter.model, conversationId: sid, sessionId: sid })}\n\n`);
      res.end();

    } catch (streamError) {
      logger.error('[Chatbot Stream]', { error: streamError.message });
      res.write(`data: ${JSON.stringify({ type: 'error', error: streamError.message })}\n\n`);
      res.end();
    }

  } catch (error) {
    logger.error('[Chatbot Stream Route]', { error: error.message });
    if (!res.headersSent) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    }
    const fallbackReply = generateFallbackReply(message || '', context || {});
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: fallbackReply })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', model: 'fallback', conversationId: sid, sessionId: sid })}\n\n`);
    res.end();
  }
});

// Conversation management
router.get('/conversations', async (req, res) => {
  try {
    const conversations = await conversationMemory.list(
      req.query.userId || 'anonymous',
      req.query.orgId || 'default'
    );
    res.json(conversations);
  } catch (error) {
    res.json([]);
  }
});

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const messages = await conversationMemory.getAllMessages(req.params.id);
    res.json(messages);
  } catch (error) {
    res.json([]);
  }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    await conversationMemory.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

router.post('/conversations/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title required' });
    }
    await conversationMemory.updateTitle(req.params.id, title);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update title' });
  }
});

router.post('/clear', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 200) {
    return res.status(400).json({ error: 'Valid sessionId required' });
  }
  aiRouter.clearConversation(sessionId);
  res.json({ success: true });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    model: aiRouter.model || 'unknown',
    service: 'Advanced AI Service',
    tools: ['streaming', 'conversations', 'tool-calling']
  });
});

function generateFallbackReply(message, context) {
  const msg = (message || '').toLowerCase();
  const pm25 = context?.pm25 ?? context?.physical?.pm25 ?? context?.live?.current?.pm25;
  const ph = context?.ph ?? context?.physical?.ph ?? context?.live?.current?.ph;
  const ehi = context?.ehi ?? context?.live?.healthScore;
  const risk = context?.live?.riskLevel || (ehi >= 80 ? 'low' : ehi >= 60 ? 'moderate' : 'high');
  const affected = (context?.live?.statuses || []).filter(s => s.level !== 'normal');

  if (msg.includes('trend') || msg.includes('rising') || msg.includes('direction')) {
    const stats = context?.live?.stats || [];
    const moving = stats.filter(s => s.direction !== 'stable');
    return moving.length > 0
      ? `Trending sensors: ${moving.map(s => `**${s.sensor}** ${s.direction} (avg ${s.avg})`).slice(0, 5).join(', ')}.`
      : 'No sensor shows a strong directional trend over the recent window.';
  }

  if (msg.includes('anomal') || msg.includes('outlier') || msg.includes('unusual')) {
    const anomalies = context?.live?.anomalies || [];
    return anomalies.length > 0
      ? `Anomalies detected: ${anomalies.map(a => `**${a.sensor}** deviates ${a.zScore.toFixed(1)}σ (value ${a.value})`).slice(0, 5).join(', ')}.`
      : 'No anomalies detected in the current monitoring window.';
  }

  if (msg.includes('compli') || msg.includes('regulat') || msg.includes('limit') || msg.includes('legal') || msg.includes('standard')) {
    const c = context?.live?.compliance || {};
    return c.exceedances?.length > 0
      ? `Regulatory exceedances under ${c.framework} (${c.authority}): ${c.exceedances.map(e => `**${e.parameter}** at ${e.exceeded_by}% over limit`).join(', ')}.`
      : `Compliant under the ${c.framework} framework (${c.authority}).`;
  }

  if (msg.includes('ehi') || msg.includes('health index') || msg.includes('score')) {
    return `The current Environmental Health Index (EHI) is **${ehi ?? 'N/A'}**. ${ehi >= 80 ? 'Conditions are **excellent**.' : ehi >= 60 ? 'Conditions are **good**.' : ehi >= 40 ? 'Conditions are **moderate**. Consider improving ventilation.' : 'Conditions are **poor**. Take action to reduce pollution sources.'}`;
  }

  if (msg.includes('pm2.5') || msg.includes('pm25') || msg.includes('air quality') || msg.includes('air')) {
    return `Current PM2.5 reading: **${pm25 || 'N/A'} µg/m³**. ${pm25 <= 12 ? 'Air quality is excellent.' : pm25 <= 25 ? 'Air quality is moderate.' : pm25 <= 45 ? 'Air quality is unhealthy for sensitive groups. Consider limiting outdoor activity.' : 'Air quality is unhealthy. Reduce outdoor exposure and consider using air purifiers.'}`;
  }

  if (msg.includes('ph') || msg.includes('water')) {
    return `Current pH reading: **${ph || 'N/A'}**. ${ph >= 6.5 && ph <= 8.5 ? 'Water pH is within normal range.' : 'Water pH is outside normal range. Check water treatment systems.'}`;
  }

  if (msg.includes('recommend') || msg.includes('suggestion') || msg.includes('help') || msg.includes('action')) {
    const tips = [];
    if (pm25 > 25) tips.push('- Consider running the air purifier to reduce PM2.5 levels.');
    if (ph < 6.5) tips.push('- Water pH is low. Check for acid contamination sources.');
    if (ph > 8.5) tips.push('- Water pH is high. Check alkalinity treatment.');
    for (const a of affected.slice(0, 3)) tips.push(`- **${a.label}** is ${a.level} (${a.value}${a.unit}). Check the affected area.`);
    if (tips.length === 0) tips.push('- All readings look good! No immediate action needed.');
    return `Based on current readings (risk: ${risk}):\n${tips.join('\n')}`;
  }

  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return 'Hello! I can help you understand your environmental data. Ask about air quality (PM2.5), water conditions (pH), the EHI score, trends, anomalies, compliance, or recommendations.';
  }

  return `I can help with environmental monitoring. Try asking about:\n- Air quality / PM2.5 levels\n- Water pH conditions\n- EHI score\n- Trends and anomalies\n- Compliance limits\n- Recommendations\n\n*Note: The AI service is temporarily offline. This is a local fallback response based on live data.*`;
}

module.exports = router;
