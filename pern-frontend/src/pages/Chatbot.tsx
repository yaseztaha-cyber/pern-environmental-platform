import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../lib/i18n';
import {
  MessageCircle,
  Send,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  Bot,
  User,
  Pencil,
  X,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { Card, Btn, SectionTitle } from '../components/ui';

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

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const loadConversations = async () => {
    try {
      const convs = await apiClient.getConversations();
      setConversations(Array.isArray(convs) ? convs : []);
    } catch {
      setConversations([]);
    }
  };

  useEffect(() => { loadConversations(); }, []);

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
        id: m.id, role: m.role, content: m.content, timestamp: m.timestamp, toolsUsed: m.toolsUsed,
      })) : []);
    } catch { setMessages([]); }
  };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  const startNewConversation = () => { setCurrentConversationId(null); setMessages([]); inputRef.current?.focus(); };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) { setCurrentConversationId(null); setMessages([]); }
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

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

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

      if (newConvId && !currentConversationId) { setCurrentConversationId(newConvId); loadConversations(); }
      else if (newConvId) { loadConversations(); }
    } catch (err: any) {
      setError(err?.message || 'Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally { setLoading(false); }
  };

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = sessionStorage.getItem('pern_auth_token');
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch { return {}; }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
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
    <div className="flex h-[calc(100vh-4rem)] -m-4 md:-m-6 lg:-m-8">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-64 border-r border-[var(--border)] bg-[var(--bg-1)] flex flex-col shrink-0">
          <div className="p-3 border-b border-[var(--border)]">
            <button onClick={startNewConversation} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--emerald)] text-white rounded-[var(--radius-sm)] text-sm hover:bg-emerald-500 transition-colors">
              <Plus size={14} /> New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="p-3 text-xs text-[var(--text-disabled)]">No conversations yet</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setCurrentConversationId(conv.id)}
                className={`group flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-b border-[var(--border)] transition-colors ${
                  currentConversationId === conv.id
                    ? 'bg-[var(--emerald)]/10 text-[var(--emerald)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <MessageCircle size={14} className="shrink-0 opacity-40" />
                {editingId === conv.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(conv.id); }} autoFocus className="flex-1 text-xs bg-[var(--bg-0)] border border-[var(--border)] rounded px-1 py-0.5 text-[var(--text-primary)]" onClick={(e) => e.stopPropagation()} />
                    <button onClick={(e) => { e.stopPropagation(); saveEdit(conv.id); }} className="text-[var(--emerald)]"><Check size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-[var(--text-disabled)]"><X size={12} /></button>
                  </div>
                ) : (
                  <span className="flex-1 truncate">{conv.title}</span>
                )}
                {editingId !== conv.id && (
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={(e) => startEdit(conv, e)} className="text-[var(--text-disabled)] hover:text-[var(--text-secondary)]"><Pencil size={12} /></button>
                    <button onClick={(e) => deleteConversation(conv.id, e)} className="text-[var(--text-disabled)] hover:text-[var(--rose)]"><Trash2 size={12} /></button>
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
        <div className="border-b border-[var(--border)] px-4 py-2 flex items-center gap-3 bg-[var(--bg-1)]/80 backdrop-blur-xl shrink-0">
          <button onClick={() => setShowSidebar(!showSidebar)} className="p-1.5 rounded-[var(--radius-xs)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
            {showSidebar ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--emerald)] to-emerald-600 flex items-center justify-center shadow-glow-sm">
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[var(--text-primary)]">{t('chatbot.title', 'EcoSentinel AI')}</h1>
              <p className="text-[10px] text-[var(--text-disabled)]">{t('chatbot.subtitle', 'Environmental Intelligence Assistant')}</p>
            </div>
          </div>
          {user && (
            <div className="ml-auto flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <User size={14} />
              <span>{user.name || user.email || 'User'}</span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
              <div className="w-16 h-16 rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--emerald)] to-emerald-600 flex items-center justify-center mb-4 shadow-glow-md">
                <Bot size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">{t('chatbot.greeting', "Hello! I'm EcoSentinel AI")}</h2>
              <p className="text-[var(--text-tertiary)] mb-6 max-w-md text-sm">{t('chatbot.welcome', 'I can help you understand environmental data, identify anomalies, and optimize your automation rules.')}</p>
              <div className="grid grid-cols-2 gap-2 max-w-lg">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(action.msg)}
                    className="p-3 text-left text-sm border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)] transition-all"
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
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--emerald)] to-emerald-600 flex items-center justify-center shrink-0 shadow-glow-sm">
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-[var(--emerald)] text-white'
                  : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)]'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="text-sm prose prose-sm max-w-none prose-p:text-[var(--text-primary)] prose-headings:text-[var(--text-primary)] prose-code:text-[var(--emerald)] prose-pre:bg-[var(--bg-0)]">
                    {msg.content ? renderMarkdown(msg.content) : (
                      <Loader2 size={16} className="animate-spin text-[var(--text-disabled)]" />
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
                        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-[var(--emerald)]/10 text-[var(--emerald)] rounded-full">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
                  <User size={16} className="text-[var(--text-secondary)]" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-4 mb-2 p-3 bg-[var(--rose)]/10 border border-[var(--rose)]/20 rounded-[var(--radius-sm)] flex items-center gap-2 text-sm text-[var(--rose)]">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto hover:text-[var(--text-primary)]"><X size={14} /></button>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-[var(--border)] p-4 bg-[var(--bg-1)]/80 backdrop-blur-xl">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chatbot.placeholder', 'Ask about environmental data...')}
              className="flex-1 resize-none border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-2.5 text-sm bg-[var(--bg-0)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-2 focus:ring-[var(--emerald)]/50 focus:border-[var(--emerald)] transition-colors"
              rows={1}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="px-4 py-2.5 bg-[var(--emerald)] text-white rounded-[var(--radius-sm)] hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-glow-sm"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
