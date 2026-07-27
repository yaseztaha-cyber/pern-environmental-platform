/**
 * PERN AI Conversation Memory
 * Persistent conversation storage with PostgreSQL + in-memory fallback
 */

const db = require('../db');
const crypto = require('crypto');
const logger = require('../utils/logger');

class ConversationMemory {
  constructor() {
    this.inMemoryStore = new Map();
    this.MAX_CONVERSATIONS = 100;
  }

  /**
   * Create a new conversation
   */
  async create(title, userId, orgId, model, id) {
    const convId = id || crypto.randomUUID();
    await db.createConversation(convId, title, userId, orgId, model);
    this.inMemoryStore.set(convId, { title, history: [] });
    if (this.inMemoryStore.size > this.MAX_CONVERSATIONS) {
      const oldest = this.inMemoryStore.keys().next().value;
      this.inMemoryStore.delete(oldest);
    }
    logger.info('[ConvMem] Created conversation', { id: convId, title });
    return convId;
  }

  /**
   * List conversations for a user/org
   */
  async list(userId, orgId, limit = 50) {
    return db.getConversations(userId, orgId, limit);
  }

  /**
   * Get conversation history as message array for LLM
   */
  async getHistory(conversationId, limit = 12) {
    // Try DB first
    const dbMessages = await db.getRecentMessages(conversationId, limit);
    if (dbMessages.length > 0) {
      return dbMessages.map(m => ({ role: m.role, content: m.content }));
    }
    // Fallback to in-memory
    const mem = this.inMemoryStore.get(conversationId);
    return mem ? mem.history.slice(-limit) : [];
  }

  /**
   * Save a message pair (user + assistant)
   */
  async saveMessage(conversationId, role, content, model, tokensUsed) {
    await db.saveMessage(conversationId, role, content, model, tokensUsed);

    // Also update in-memory for fast access
    if (!this.inMemoryStore.has(conversationId)) {
      this.inMemoryStore.set(conversationId, { history: [] });
    }
    const mem = this.inMemoryStore.get(conversationId);
    mem.history.push({ role, content });
    if (mem.history.length > 24) {
      mem.history.splice(0, mem.history.length - 24);
    }
  }

  /**
   * Update conversation title (auto-generate from first message if needed)
   */
  async updateTitle(conversationId, title) {
    await db.updateConversation(conversationId, { title });
    const mem = this.inMemoryStore.get(conversationId);
    if (mem) mem.title = title;
  }

  /**
   * Auto-generate title from first user message
   */
  generateTitle(message) {
    const cleaned = message.replace(/\n/g, ' ').trim();
    return cleaned.length > 60 ? cleaned.substring(0, 57) + '...' : cleaned;
  }

  /**
   * Delete a conversation
   */
  async delete(conversationId) {
    await db.deleteConversation(conversationId);
    this.inMemoryStore.delete(conversationId);
    logger.info('[ConvMem] Deleted conversation', { id: conversationId });
  }

  /**
   * Search conversations
   */
  async search(query, userId) {
    return db.searchConversations(query, userId);
  }

  /**
   * Get all messages for a conversation (for export/display)
   */
  async getAllMessages(conversationId) {
    return db.getMessages(conversationId, 500);
  }
}

module.exports = new ConversationMemory();
