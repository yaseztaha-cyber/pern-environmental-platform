import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../lib/i18n';
import {
  MessageCircle,
  Send,
  Plus,
  Trash2,
  Settings,
  Loader2,
  AlertTriangle,
  Bot,
  User,
  Pencil,
  X,
  Check,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolsUsed?: string[];
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export default function Chatbot() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Multi-session state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Load conversations
  const loadConversations = async () => {
    try {
      const convs = await apiClient.getConversations();
      setConversations(Array.isArray(convs) ? convs : []);
    } catch {
      setConversations([]);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      loadMessages(currentConversationId);
    } else {
      setMessages([]);
    }
  }, [currentConversationId]);

  const loadMessages = async (convId: string) => {
    try {
      const msgs = await apiClient.getConversationMessages(convId);
      setMessages(Array.isArray(msgs) ? msgs.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        toolsUsed: m.toolsUsed,
      })) : []);
    } catch {
      setMessages([]);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    inputRef.current?.focus();
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch { /* ignore */ }
  };

  const startEdit = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const saveEdit = async (id: string) => {
    try {
      await apiClient.updateConversationTitle(id, editTitle);
      setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title: editTitle } : c));
      setEditingId(null);
    } catch { /* ignore */ }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    // Create temp placeholder for streaming
    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() }]);

    try {
      const response = await fetch('/api/chatbot/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ message: text, conversationId: currentConversationId }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulated = '';
      let newConvId = currentConversationId;
      let toolsUsed: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.error) { setError(payload.error); continue; }
              if (payload.done) { if (payload.conversationId) newConvId = payload.conversationId; continue; }
              if (payload.content) { accumulated += payload.content; }
              if (payload.toolsUsed) { toolsUsed = payload.toolsUsed; }
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: accumulated, toolsUsed } : m));
            } catch { /* skip malformed */ }
          }
        }
      }

      // Update conversation list
      if (newConvId && !currentConversationId) {
        setCurrentConversationId(newConvId);
        loadConversations();
      } else if (newConvId) {
        loadConversations();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setLoading(false);
    }
  };

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = localStorage.getItem('auth_token');
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    { label: 'EHI Summary', msg: 'What is the current Environmental Health Index reading and what are the main factors affecting it?' },
    { label: 'All Sensors', msg: 'Show me a comprehensive reading of all connected sensors and their current status.' },
    { label: 'Anomalies', msg: 'Are there any anomalous readings across the sensors that need attention?' },
    { label: 'Maintenance', msg: 'Which devices may need maintenance soon based on their current readings and trends?' },
  ];

  const renderMarkdown = (content: string) => (
    <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-64 border-r bg-gray-50 dark:bg-gray-800 flex flex-col">
          <div className="p-3 border-b flex gap-2">
            <button onClick={startNewConversation} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
              <Plus size={14} /> New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="p-3 text-xs text-gray-400">No conversations yet</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setCurrentConversationId(conv.id)}
                className={`group flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 transition-colors ${
                  currentConversationId === conv.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <MessageCircle size={14} className="shrink-0 opacity-40" />
                {editingId === conv.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(conv.id); }} autoFocus className="flex-1 text-xs bg-white dark:bg-gray-900 border rounded px-1 py-0.5" onClick={(e) => e.stopPropagation()} />
                    <button onClick={(e) => { e.stopPropagation(); saveEdit(conv.id); }} className="text-green-600"><Check size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-gray-400"><X size={12} /></button>
                  </div>
                ) : (
                  <span className="flex-1 truncate">{conv.title}</span>
                )}
                {editingId !== conv.id && (
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={(e) => startEdit(conv, e)} className="text-gray-400 hover:text-gray-600"><Pencil size={12} /></button>
                    <button onClick={(e) => deleteConversation(conv.id, e)} className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b px-4 py-2 flex items-center gap-3 bg-white dark:bg-gray-800">
          <button onClick={() => setShowSidebar(!showSidebar)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <Settings size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">{t('chatbot.title', 'EcoSentinel AI')}</h1>
              <p className="text-xs text-gray-500">{t('chatbot.subtitle', 'Environmental Intelligence Assistant')}</p>
            </div>
          </div>
          {user && (
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
              <User size={14} />
              <span>{user.name || user.email || 'User'}</span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4">
                <Bot size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold mb-2">{t('chatbot.greeting', 'Hello! I\'m EcoSentinel AI')}</h2>
              <p className="text-gray-500 mb-6 max-w-md">{t('chatbot.welcome', 'I can help you understand environmental data, identify anomalies, and optimize your automation rules.')}</p>
              <div className="grid grid-cols-2 gap-2 max-w-lg">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(action.msg)}
                    className="p-3 text-left text-sm border rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 transition-all"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 border'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                    {msg.content ? renderMarkdown(msg.content) : (
                      <Loader2 size={16} className="animate-spin text-gray-400" />
                    )}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] opacity-50">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="flex gap-1">
                      {msg.toolsUsed.map((tool, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center shrink-0">
                  <User size={16} className="text-white" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-4 mb-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {/* Input */}
        <div className="border-t p-4 bg-white dark:bg-gray-800">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chatbot.placeholder', 'Ask about environmental data...')}
              className="flex-1 resize-none border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-700"
              rows={1}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
