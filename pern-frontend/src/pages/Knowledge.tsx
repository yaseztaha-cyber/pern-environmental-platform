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
      const result = await apiClient.chat({ message: aiQuestion, context: 'knowledge-base' });
      setAiAnswer(result?.reply || result?.response || 'No answer available. Please try rephrasing your question.');
    } catch (err: any) {
      setAiError(err?.message || 'Failed to get AI response. The AI service may be offline.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="text-blue-600" size={28} />
          {t('knowledge.title', 'Knowledge Base')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('knowledge.subtitle', 'Articles, guides, and AI-powered answers about environmental monitoring')}
        </p>
      </div>

      {/* AI Q&A Section */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <MessageCircle size={18} className="text-purple-600" />
          Ask EcoSentinel AI
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Ask any question about environmental monitoring, sensors, automation, or the platform.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') askAI(); }}
            placeholder="e.g., What PM2.5 level is considered safe for indoor use?"
            className="flex-1 border rounded-lg px-4 py-2.5 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={askAI}
            disabled={!aiQuestion.trim() || aiLoading}
            className="px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Ask
          </button>
        </div>

        {aiAnswer && (
          <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border prose prose-sm dark:prose-invert max-w-none">
            <Markdown remarkPlugins={[remarkGfm]}>{aiAnswer}</Markdown>
          </div>
        )}
        {aiError && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
            <X size={14} />
            {aiError}
          </div>
        )}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('knowledge.search', 'Search articles...')}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs rounded-full border whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white border-transparent'
                  : 'bg-white dark:bg-gray-800 text-gray-600 border-gray-200 dark:border-gray-700 hover:border-blue-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Articles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredArticles.map((article) => (
          <div
            key={article.id}
            className="bg-white dark:bg-gray-800 rounded-xl p-5 border shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {article.category}
              </span>
              <Lightbulb size={14} className="text-yellow-500" />
            </div>
            <h3 className="font-semibold text-sm mb-1">{article.title}</h3>
            <p className="text-xs text-gray-500 mb-3">{article.summary}</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {article.tags.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500">
                  #{tag}
                </span>
              ))}
            </div>
            <button
              onClick={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              {expandedArticle === article.id ? 'Collapse' : 'Read more'} <ExternalLink size={10} />
            </button>
            {expandedArticle === article.id && (
              <div className="mt-3 pt-3 border-t text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line prose prose-sm dark:prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>{article.content}</Markdown>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredArticles.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm">No articles found matching your search.</p>
        </div>
      )}
    </div>
  );
}
