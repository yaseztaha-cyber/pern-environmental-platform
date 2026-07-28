import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import {
  BookOpen,
  Search,
  MessageCircle,
  Send,
  Loader2,
  Lightbulb,
  ExternalLink,
  X,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiClient } from '../lib/api-client';
import { PageHeader, Card, Btn, Pill, EmptyState } from '../components/ui';

interface Article {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  tags: string[];
}

const ARTICLES: Article[] = [
  {
    id: 'air-quality-1',
    title: 'Understanding Indoor Air Quality',
    category: 'Air Quality',
    summary: 'Learn about the key pollutants affecting indoor air quality and how to monitor them effectively.',
    content: `
Indoor air quality (IAQ) is a critical factor in building health and occupant well-being. Key pollutants include:

**CO₂ (Carbon Dioxide)**
- Normal outdoor levels: ~420 ppm
- Acceptable indoor levels: <1000 ppm
- Above 2000 ppm: Drowsiness, poor concentration

**PM2.5 (Fine Particulate Matter)**
- WHO guideline: <15 µg/m³ (annual), <45 µg/m³ (24-hour)
- Sources: Cooking, smoking, outdoor air infiltration
- Health effects: Respiratory and cardiovascular issues

**CO (Carbon Monoxide)**
- Safe limit: <9 ppm (8-hour average)
- Sources: Combustion appliances, vehicle exhaust
- Dangerous levels: >35 ppm (immediate health risk)

**SO₂ and NO₂**
- Both are harmful at elevated levels
- Primarily from combustion sources
- Can trigger asthma and respiratory irritation
    `,
    tags: ['air-quality', 'CO2', 'PM2.5', 'monitoring'],
  },
  {
    id: 'ehi-1',
    title: 'The Environmental Health Index (EHI)',
    category: 'Metrics',
    summary: 'Understanding how EHI combines multiple sensor readings into a single health score.',
    content: `
The Environmental Health Index (EHI) is a composite metric that provides a unified view of indoor environmental conditions.

**Formula Components:**
\`\`\`
EHI = w₁·f(T) + w₂·f(H) + w₃·f(P) + w₄·f(CO₂) + w₅·f(PM2.5)
     + w₆·f(CO) + w₇·f(SO₂) + w₈·f(NO₂)
\`\`\`

**Weight Distribution:**
- Temperature (w₁): 0.15
- Humidity (w₂): 0.15
- Pressure (w₃): 0.05
- CO₂ (w₄): 0.20
- PM2.5 (w₅): 0.20
- CO (w₆): 0.10
- SO₂ (w₇): 0.075
- NO₂ (w₈): 0.075

**Score Interpretation:**
- 80-100: Excellent conditions
- 60-79: Good, minor improvements possible
- 40-59: Moderate, attention recommended
- 20-39: Poor, immediate action needed
- 0-19: Critical, evacuation may be necessary
    `,
    tags: ['EHI', 'metrics', 'scoring', 'formula'],
  },
  {
    id: 'automation-1',
    title: 'Setting Up Automation Rules',
    category: 'Automation',
    summary: 'Step-by-step guide to creating effective environmental automation rules.',
    content: `
EcoSentinel supports three types of automation rules:

**1. Threshold Rules**
Trigger actions when sensor values cross defined limits.
\`\`\`
IF temperature > 28°C THEN activate_cooling
IF co2 > 1000ppm THEN increase_ventilation
\`\`\`

**2. Time-based Rules**
Schedule actions at specific times or intervals.
\`\`\`
EVERY 30 minutes → log_environmental_data
AT 08:00 → generate_morning_report
\`\`\`

**3. Compound Rules**
Combine conditions for intelligent automation.
\`\`\`
IF temperature > 26°C AND humidity > 70% THEN activate_dehumidifier
IF pm2.5 > 35 AND co2 > 800ppm THEN max_ventilation
\`\`\`

**Best Practices:**
- Start with conservative thresholds and refine over time
- Add hysteresis to prevent rapid on/off cycling
- Include cooldown periods for equipment protection
- Test rules with simulated data before deployment
    `,
    tags: ['automation', 'rules', 'threshold', 'scheduling'],
  },
  {
    id: 'sensors-1',
    title: 'Sensor Placement Best Practices',
    category: 'Hardware',
    summary: 'Optimal sensor placement strategies for accurate environmental monitoring.',
    content: `
Proper sensor placement is crucial for accurate monitoring.

**Temperature & Humidity:**
- Mount at 1.2-1.5m height (breathing zone)
- Away from direct sunlight and heat sources
- Avoid corners where air circulation is poor
- At least 1m from windows and doors

**CO₂ Sensors:**
- Central location in monitored space
- Away from windows (prevents outdoor air contamination)
- Not near doors or high-traffic areas
- Consider multiple sensors for large rooms

**PM2.5 Sensors:**
- Away from cooking areas (unless monitoring them)
- Central room position preferred
- Avoid placement near HVAC vents
- Height: 1-1.5m from floor

**General Guidelines:**
- Document exact sensor locations
- Calibrate sensors on installation
- Regular maintenance schedule (quarterly)
- Consider environmental factors affecting readings
    `,
    tags: ['sensors', 'placement', 'hardware', 'calibration'],
  },
  {
    id: 'predictive-1',
    title: 'Predictive Analytics in Environmental Monitoring',
    category: 'Analytics',
    summary: 'How machine learning and statistical methods predict environmental trends.',
    content: `
EcoSentinel uses multiple prediction methods:

**Holt-Winters (Triple Exponential Smoothing)**
- Best for data with trends and seasonality
- Captures level, trend, and seasonal components
- Ideal for: Temperature, humidity patterns

**Holt's Double Exponential Smoothing**
- Captures level and trend
- No seasonal component
- Good for: CO₂ trends, long-term drift

**Ensemble Methods**
- Combines multiple prediction approaches
- Weighted average based on recent accuracy
- Provides confidence intervals for predictions

**Practical Applications:**
- Predict maintenance needs before failures
- Optimize HVAC scheduling based on forecasts
- Early warning for air quality degradation
- Energy consumption optimization
    `,
    tags: ['analytics', 'prediction', 'machine-learning', 'forecasting'],
  },
  {
    id: 'troubleshooting-1',
    title: 'Common Sensor Issues & Solutions',
    category: 'Troubleshooting',
    summary: 'Quick reference guide for diagnosing and resolving common sensor problems.',
    content: `
**Sensor Reading Zero or Null:**
- Check power supply and connections
- Verify network connectivity
- Restart sensor module
- Check for firmware updates

**Erratic/Unstable Readings:**
- Ensure sensor is not near interference sources
- Check for loose connections
- Allow 30-minute stabilization after power-on
- Verify calibration status

**Drift Over Time:**
- Normal for some sensor types (especially gas sensors)
- Schedule regular calibration
- Compare with known reference values
- Consider sensor replacement if drift exceeds 10%

**Network Issues:**
- Verify MQTT broker connectivity
- Check WiFi signal strength
- Review firewall rules
- Validate device credentials

**Data Gaps in Dashboard:**
- Check sensor battery levels
- Verify data transmission intervals
- Review database storage capacity
- Check for API rate limiting
    `,
    tags: ['troubleshooting', 'debugging', 'maintenance', 'calibration'],
  },
];

const CATEGORIES = ['All', ...Array.from(new Set(ARTICLES.map((a) => a.category)))];

export default function Knowledge() {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  // AI Q&A state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const filteredArticles = ARTICLES.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const askAI = async () => {
    if (!aiQuestion.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiAnswer('');
    try {
      const result = await apiClient.chat(aiQuestion, 'knowledge-base');
      setAiAnswer(result?.reply || result?.response || 'No answer available. Please try rephrasing your question.');
    } catch (err: any) {
      setAiError(err?.message || 'Failed to get AI response. The AI service may be offline.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      <PageHeader
        title={t('knowledge.title', 'Knowledge Base')}
        subtitle={t('knowledge.subtitle', 'Articles, guides, and AI-powered answers about environmental monitoring')}
      />

      {/* AI Q&A Section */}
      <Card hover={false}>
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle size={18} className="text-[var(--violet)]" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Ask EcoSentinel AI</h3>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Ask any question about environmental monitoring, sensors, automation, or the platform.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') askAI(); }}
            placeholder="e.g., What PM2.5 level is considered safe for indoor use?"
            className="flex-1 border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-2.5 text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--violet)]"
          />
          <Btn variant="primary" size="sm" loading={aiLoading} onClick={askAI} disabled={!aiQuestion.trim()}>
            {!aiLoading && <Send size={14} />}
            Ask
          </Btn>
        </div>

        {aiAnswer && (
          <div className="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] border border-[var(--border)] prose prose-sm dark:prose-invert max-w-none">
            <Markdown remarkPlugins={[remarkGfm]}>{aiAnswer}</Markdown>
          </div>
        )}
        {aiError && (
          <div className="mt-4 p-3 bg-[var(--rose-dim)] border border-[var(--rose)]/20 rounded-[var(--radius-sm)] text-sm text-[var(--rose)] flex items-center gap-2">
            <X size={14} />
            {aiError}
          </div>
        )}
      </Card>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('knowledge.search', 'Search articles...')}
            className="w-full pl-10 pr-4 py-2 border border-[var(--border)] rounded-[var(--radius-sm)] text-sm bg-[var(--bg-primary)] text-[var(--text-primary)]"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <Btn
              key={cat}
              variant={selectedCategory === cat ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Btn>
          ))}
        </div>
      </div>

      {/* Articles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredArticles.map((article) => (
          <Card key={article.id}>
            <div className="flex items-start justify-between mb-2">
              <Pill tone="cyan">{article.category}</Pill>
              <Lightbulb size={14} className="text-[var(--amber)]" />
            </div>
            <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-1">{article.title}</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3">{article.summary}</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {article.tags.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-tertiary)]">
                  #{tag}
                </span>
              ))}
            </div>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
            >
              {expandedArticle === article.id ? 'Collapse' : 'Read more'} <ExternalLink size={10} />
            </Btn>
            {expandedArticle === article.id && (
              <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)] whitespace-pre-line prose prose-sm dark:prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>{article.content}</Markdown>
              </div>
            )}
          </Card>
        ))}
      </div>

      {filteredArticles.length === 0 && (
        <Card hover={false}>
          <EmptyState
            icon={<BookOpen size={22} />}
            title="No articles found"
            message="No articles match your search. Try different keywords."
          />
        </Card>
      )}
    </div>
  );
}
