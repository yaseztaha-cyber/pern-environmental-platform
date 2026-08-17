import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { useI18n } from '../lib/i18n';
import { Badge, Btn, PageHeader } from '../components/ui';

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
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [rule, setRule] = useState<GeneratedRule | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const examples = [
    t('ruleGen.ex.0', 'If PM2.5 goes above 50, turn on the fan on device esp32-cario-001'),
    t('ruleGen.ex.1', 'When pH drops below 6.5, activate the water pump'),
    t('ruleGen.ex.2', 'If humidity is above 80%, send an alert notification'),
    t('ruleGen.ex.3', 'When CO2 exceeds 1000 ppm, turn on the ventilation'),
    t('ruleGen.ex.4', 'If water temperature goes above 30°C, activate cooling'),
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
        setError(result.error || t('ruleGen.errorGenerate', 'Failed to generate rule'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ruleGen.errorRequest', 'Request failed'));
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
      setError(err instanceof Error ? err.message : t('ruleGen.errorSave', 'Failed to save rule'));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('ruleGen.title', 'AI Rule Generator')}
        subtitle={t('ruleGen.subtitle', 'Describe an automation rule in natural language and let AI convert it to a structured rule.')}
      />

      {/* Input */}
      <div className="p-5 rounded-[var(--radius-md)] bg-[var(--bg-1)] border border-[var(--border)]">
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
          {t('ruleGen.describeRule', 'Describe your rule')}
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('ruleGen.inputPlaceholder', 'e.g. When PM2.5 exceeds 50 µg/m³, turn on the fan')}
          className="w-full h-28 px-4 py-3 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] resize-none text-sm"
        />
        <Btn
          variant="primary"
          onClick={generate}
          disabled={loading || input.length < 10}
          loading={loading}
          className="mt-3 flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {loading ? t('ruleGen.generating', 'Generating...') : t('ruleGen.generateRule', 'Generate Rule')}
        </Btn>
      </div>

      {/* Examples */}
      <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
        <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          {t('ruleGen.examples', 'Example prompts')}
        </div>
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setInput(ex)}
              className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-1)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--emerald)]/40 hover:text-[var(--emerald)] transition-colors text-left rtl:text-right"
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
            <span className="font-semibold text-sm">{t('ruleGen.generatedRule', 'Generated Rule')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-[var(--text-tertiary)] text-xs">{t('ruleGen.name', 'Name')}</span>
              <div className="font-medium">{rule.name}</div>
            </div>
            <div>
              <span className="text-[var(--text-tertiary)] text-xs">{t('ruleGen.condition', 'Condition')}</span>
              <div className="font-medium">
                {rule.sensor} {rule.operator} {rule.threshold}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-tertiary)] text-xs">{t('ruleGen.action', 'Action')}</span>
              <div className="font-medium">
                {rule.action.actuator} → {rule.action.command} {t('ruleGen.onDevice', 'on {device}', { device: rule.action.device })}
              </div>
            </div>
            <div>
              <span className="text-[var(--text-tertiary)] text-xs">{t('ruleGen.priority', 'Priority')}</span>
              <div className="font-medium">
                <Badge variant={rule.priority >= 7 ? 'error' : rule.priority >= 4 ? 'warning' : 'success'}>
                  {rule.priority}/10
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            {!saved ? (
              <Btn variant="primary" size="sm" onClick={saveRule} className="text-xs">
                <Zap size={14} /> {t('ruleGen.saveRule', 'Save Rule')}
              </Btn>
            ) : (
              <Badge variant="success">
                <CheckCircle size={12} className="mr-1 rtl:ml-1" /> {t('ruleGen.saved', 'Saved to Automation Rules')}
              </Badge>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
