import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Wand2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { Badge } from '../components/ui';

interface GeneratedRule {
  name: string;
  sensor: string;
  operator: string;
  threshold: number;
  action: { device: string; actuator: string; command: string };
  priority: number;
  enabled: boolean;
}

export default function RuleGenerator() {
  const [input, setInput] = useState('');
  const [rule, setRule] = useState<GeneratedRule | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const examples = [
    'If PM2.5 goes above 50, turn on the fan on device esp32-cario-001',
    'When pH drops below 6.5, activate the water pump',
    'If humidity is above 80%, send an alert notification',
    'When CO2 exceeds 1000 ppm, turn on the ventilation',
    'If water temperature goes above 30°C, activate cooling',
  ];

  const generate = async () => {
    if (input.length < 10) return;
    setLoading(true);
    setError('');
    setRule(null);
    setSaved(false);

    try {
      const result = await apiClient.post<{ success?: boolean; rule?: GeneratedRule; error?: string }>(
        '/ai-tools/generate-rule',
        { text: input }
      );

      if (result.success && result.rule) {
        setRule(result.rule);
      } else {
        setError(result.error || 'Failed to generate rule');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async () => {
    if (!rule) return;
    try {
      await apiClient.post('/automation/rules', rule);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wand2 size={22} className="text-[var(--emerald)]" />
          AI Rule Generator
        </h1>
        <p className="text-[var(--text-tertiary)] text-sm mt-1">
          Describe an automation rule in natural language and let AI convert it to a structured rule.
        </p>
      </div>

      {/* Input */}
      <div className="p-5 rounded-[var(--radius-md)] bg-[var(--bg-1)] border border-[var(--border)]">
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
          Describe your rule
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. When PM2.5 exceeds 50 µg/m³, turn on the fan"
          className="w-full h-28 px-4 py-3 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] resize-none text-sm"
        />
        <button
          onClick={generate}
          disabled={loading || input.length < 10}
          className="btn btn-primary mt-3 flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {loading ? 'Generating...' : 'Generate Rule'}
        </button>
      </div>

      {/* Examples */}
      <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
        <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          Example prompts
        </div>
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setInput(ex)}
              className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-1)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--emerald)]/40 hover:text-[var(--emerald)] transition-colors text-left"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-[var(--radius-sm)] bg-[var(--rose-dim)] border border-[var(--rose)]/20 flex items-start gap-3"
        >
          <AlertCircle size={18} className="text-[var(--rose)] mt-0.5 shrink-0" />
          <div className="text-sm text-[var(--rose)]">{error}</div>
        </motion.div>
      )}

      {/* Generated Rule */}
      {rule && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-[var(--radius-md)] bg-[var(--bg-1)] border border-[var(--emerald)]/30"
        >
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={18} className="text-[var(--emerald)]" />
            <span className="font-semibold text-sm">Generated Rule</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-[var(--text-tertiary)] text-xs">Name</span>
              <div className="font-medium">{rule.name}</div>
            </div>
            <div>
              <span className="text-[var(--text-tertiary)] text-xs">Condition</span>
              <div className="font-medium">
                {rule.sensor} {rule.operator} {rule.threshold}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-tertiary)] text-xs">Action</span>
              <div className="font-medium">
                {rule.action.actuator} → {rule.action.command} on {rule.action.device}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-tertiary)] text-xs">Priority</span>
              <div className="font-medium">
                <Badge variant={rule.priority >= 7 ? 'error' : rule.priority >= 4 ? 'warning' : 'success'}>
                  {rule.priority}/10
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            {!saved ? (
              <button onClick={saveRule} className="btn btn-primary text-xs">
                <Zap size={14} /> Save Rule
              </button>
            ) : (
              <Badge variant="success">
                <CheckCircle size={12} className="mr-1" /> Saved to Automation Rules
              </Badge>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
