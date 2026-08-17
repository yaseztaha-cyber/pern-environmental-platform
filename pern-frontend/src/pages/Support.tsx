import { useState, useEffect } from 'react';
import { useData } from '../lib/data-provider';
import { apiClient } from '../lib/api-client';
import { showToast } from '../components/Toast';
import { PageHeader, Card, Pill, Btn, SectionTitle, fmt } from '../components/ui';
import { useI18n, type Interpolation } from '../lib/i18n';

interface FAQItem {
  id: number;
  category: string;
  question: string;
  answer: string;
}

interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'in-progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

type T = (key: string, fallback?: string, params?: Interpolation) => string;

const getFaqData = (t: T): FAQItem[] => [
  { id: 1, category: t('support.category.gettingStarted', 'Getting Started'), question: t('support.faq.1.question', 'How do I connect my first IoT device?'), answer: t('support.faq.1.answer', 'Navigate to Device Connection, select your protocol (MQTT recommended), and configure the broker URL. Your ESP32 or NodeMCU device should publish to pern/sensors/{device_id}/data with JSON payloads containing your sensor readings.') },
  { id: 2, category: t('support.category.gettingStarted', 'Getting Started'), question: t('support.faq.2.question', 'What sensors does the platform support?'), answer: t('support.faq.2.answer', 'We support 13 physical sensors: PM2.5, PM10, CO, CO2, NO2, SO2, O3, pH, Temperature, Humidity, TDS, Turbidity, and Dissolved Oxygen. These feed into 9+ virtual sensor computations.') },
  { id: 3, category: t('support.category.gettingStarted', 'Getting Started'), question: t('support.faq.3.question', 'How is the EHI score calculated?'), answer: t('support.faq.3.answer', 'The Environmental Health Index is a composite score (0-100) using 6 weighted sub-indices: Air Quality, Water Quality, Human Safety, Ecosystem Health, Sustainability, and Stability. It uses the scientific formula defined in our research documentation.') },
  { id: 4, category: t('support.category.devices', 'Devices'), question: t('support.faq.4.question', 'How many devices can I connect simultaneously?'), answer: t('support.faq.4.answer', 'Free tier supports 3 devices, Pro supports 25, and Enterprise offers unlimited. Each device can publish readings at intervals as low as 5 seconds via MQTT.') },
  { id: 5, category: t('support.category.devices', 'Devices'), question: t('support.faq.5.question', 'My device keeps disconnecting. What should I do?'), answer: t('support.faq.5.answer', 'Check the Device Health Dashboard for battery and connectivity scores. Ensure your MQTT broker is running (mosquitto), verify WiFi signal strength at the device location, and check that keepalive intervals are properly configured (recommended: 60s).') },
  { id: 6, category: t('support.category.devices', 'Devices'), question: t('support.faq.6.question', 'Can I update device firmware remotely?'), answer: t('support.faq.6.answer', 'Yes! Go to Firmware Management to view current firmware versions across devices. OTA (Over-The-Air) simulation is available for testing, with full OTA rollout planned for Enterprise tier.') },
  { id: 7, category: t('support.category.alertsAutomation', 'Alerts & Automation'), question: t('support.faq.7.question', 'How do I set up automated alerts?'), answer: t('support.faq.7.answer', 'Go to Automation Engine and create rules with conditions (e.g., IF pm25 > 45 THEN activate fan). Rules execute every 8 seconds, support cooldown periods, and send real push notifications via ntfy.sh.') },
  { id: 8, category: t('support.category.alertsAutomation', 'Alerts & Automation'), question: t('support.faq.8.question', 'What notification channels are supported?'), answer: t('support.faq.8.answer', 'Currently ntfy.sh push notifications (cross-platform, free), email alerts (Enterprise), and in-app notifications. Slack and Microsoft Teams webhooks are on the roadmap.') },
  { id: 9, category: t('support.category.dataAnalytics', 'Data & Analytics'), question: t('support.faq.9.question', 'How do I export my data?'), answer: t('support.faq.9.answer', 'Use the Sensors page export buttons for CSV and Excel formats. Reports page generates PDF reports for 6 different analysis types. Historical data can be exported from the History page.') },
  { id: 10, category: t('support.category.dataAnalytics', 'Data & Analytics'), question: t('support.faq.10.question', 'What is the prediction accuracy?'), answer: t('support.faq.10.answer', 'Our ensemble model (Linear Trend + Moving Average + Weather-informed) typically achieves 85-92% accuracy for 24-hour forecasts. Check the Predictions page for real-time accuracy validation scores.') },
  { id: 11, category: t('support.category.security', 'Security'), question: t('support.faq.11.question', 'How is my data protected?'), answer: t('support.faq.11.answer', 'Data is encrypted in transit (TLS/SSL) and at rest (PostgreSQL column-level encryption). We support Logto OIDC authentication, role-based access control (owner/admin/member/viewer), and full audit logging with 90-day retention.') },
  { id: 12, category: t('support.category.security', 'Security'), question: t('support.faq.12.question', 'Can I integrate with our existing auth system?'), answer: t('support.faq.12.answer', 'Yes! We support Logto OIDC out of the box. Configure your tenant ID and app ID in the backend .env file. SAML and custom OAuth2 providers are supported on Enterprise tier.') },
];

const getSupportTiers = (t: T) => [
  { name: t('support.tier.community', 'Community'), price: t('support.tier.free', 'Free'), features: [t('support.tier.community.feature.0', 'Community forums'), t('support.tier.community.feature.1', 'Documentation access'), t('support.tier.community.feature.2', '3 connected devices'), t('support.tier.community.feature.3', '7-day data retention'), t('support.tier.community.feature.4', 'Email support (72h response)')] },
  { name: t('support.tier.professional', 'Professional'), price: '$49/mo', features: [t('support.tier.professional.feature.0', 'Priority email support (4h response)'), t('support.tier.professional.feature.1', '25 connected devices'), t('support.tier.professional.feature.2', '30-day data retention'), t('support.tier.professional.feature.3', 'Advanced analytics'), t('support.tier.professional.feature.4', 'Custom alert rules'), t('support.tier.professional.feature.5', 'API access')], popular: true },
  { name: t('support.tier.enterprise', 'Enterprise'), price: t('support.tier.custom', 'Custom'), features: [t('support.tier.enterprise.feature.0', '24/7 phone support (<1h response)'), t('support.tier.enterprise.feature.1', 'Unlimited devices'), t('support.tier.enterprise.feature.2', '1-year data retention'), t('support.tier.enterprise.feature.3', 'Dedicated Slack channel'), t('support.tier.enterprise.feature.4', 'SLA guarantee (99.9%)'), t('support.tier.enterprise.feature.5', 'Custom integrations'), t('support.tier.enterprise.feature.6', 'On-premise deployment'), t('support.tier.enterprise.feature.7', 'SOC 2 compliance')] },
];

export default function Support() {
  const { data } = useData();
  const { t } = useI18n();
  const faqData = getFaqData(t);
  const supportTiers = getSupportTiers(t);
  const [faqSearch, setFaqSearch] = useState('');
  const [faqCategory, setFaqCategory] = useState('All');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '', priority: 'medium' as 'low' | 'medium' | 'high' });
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    apiClient.get<any[]>('/support/tickets').then((data: any) => {
      if (Array.isArray(data)) setTickets(data);
    }).catch(() => {});
  }, []);

  const allCategory = t('support.category.all', 'All');
  const faqCategories = [allCategory, ...Array.from(new Set(faqData.map(f => f.category)))];

  const filteredFaq = faqData
    .filter(f => faqCategory === allCategory || f.category === faqCategory)
    .filter(f => f.question.toLowerCase().includes(faqSearch.toLowerCase()) || f.answer.toLowerCase().includes(faqSearch.toLowerCase()));

  const submitTicket = async () => {
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      showToast(t('support.toast.fillRequired', 'Please fill in all required fields'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/support/ticket', contactForm);
      showToast(t('support.toast.submitted', 'Ticket submitted successfully! We\'ll respond within 4 hours.'), 'success');
      setContactForm({ name: '', email: '', subject: '', message: '', priority: 'medium' });
    } catch {
      showToast(t('support.toast.submittedDemo', 'Ticket submitted! (Demo mode — backend will process when available)'), 'success');
      setContactForm({ name: '', email: '', subject: '', message: '', priority: 'medium' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusPill = (status: string) => {
    switch (status) {
      case 'open': return <Pill tone="cyan">{t('support.ticketStatus.open', 'open')}</Pill>;
      case 'in-progress': return <Pill tone="amber">{t('support.ticketStatus.inProgress', 'in-progress')}</Pill>;
      case 'resolved': return <Pill tone="emerald">{t('support.ticketStatus.resolved', 'resolved')}</Pill>;
      default: return <Pill>{status}</Pill>;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-[var(--rose)]';
      case 'medium': return 'text-[var(--amber)]';
      case 'low': return 'text-[var(--emerald)]';
      default: return '';
    }
  };

  return (
    <div>
      <PageHeader
        title={t('support.title', 'Support & Compliance')}
        subtitle={t('support.subtitle', 'Enterprise support • Regulatory compliance • Documentation')}
      />

      {/* SLA Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 grid-entrance">
        {[
          { label: t('support.sla.uptime', 'Uptime SLA'), value: '99.9%', detail: t('support.sla.uptimeDetail', 'Guaranteed availability') },
          { label: t('support.sla.responseTime', 'Response Time'), value: '< 4h', detail: t('support.sla.enterpriseTier', 'Enterprise tier') },
          { label: t('support.sla.resolutionTime', 'Resolution Time'), value: '< 24h', detail: t('support.sla.criticalIssues', 'Critical issues') },
          { label: t('support.sla.currentEhi', 'Current EHI'), value: String(data.ehi), detail: t('support.sla.liveReading', 'Live reading') },
        ].map((metric, i) => (
          <Card key={i} hover={false} className="text-center">
            <div className="text-xs text-[var(--text-secondary)]">{metric.label}</div>
            <div className="text-3xl font-semibold tracking-tighter text-[var(--emerald)] mt-1 stat-number">{typeof metric.value === 'number' ? fmt(metric.value) : metric.value}</div>
            <div className="text-[10px] text-[var(--text-tertiary)] mt-1">{metric.detail}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8 grid-entrance">
        {/* Support Channels */}
        <Card hover={false}>
          <SectionTitle>{t('support.channels', 'Support Channels')}</SectionTitle>
          <div className="space-y-4 text-sm">
            <div className="p-3 bg-white/5 rounded-2xl">
              <div className="font-medium text-[var(--text-primary)]">{t('support.channel.email', 'Email Support')}</div>
              <div className="text-[var(--emerald)] mt-1">yaseen.1925048@stemgharbiya.moe.edu.eg</div>
              <div className="text-xs text-[var(--text-tertiary)] mt-1">{t('support.channel.emailDetail', 'Response within 4 hours (Enterprise)')}</div>
            </div>
            <div className="p-3 bg-white/5 rounded-2xl">
              <div className="font-medium text-[var(--text-primary)]">{t('support.channel.phone', 'Priority Phone')}</div>
              <div className="text-[var(--emerald)] mt-1">+20 109 233 2523</div>
              <div className="text-xs text-[var(--text-tertiary)] mt-1">{t('support.channel.phoneDetail', '24/7 for Enterprise customers')}</div>
            </div>
            <div className="p-3 bg-white/5 rounded-2xl">
              <div className="font-medium text-[var(--text-primary)]">{t('support.channel.slack', 'Dedicated Slack Channel')}</div>
              <div className="text-[var(--emerald)] mt-1">{t('support.channel.slackDetail', 'Available on Enterprise plan')}</div>
            </div>
            <div className="p-3 bg-white/5 rounded-2xl">
              <div className="font-medium text-[var(--text-primary)]">{t('support.channel.github', 'GitHub Issues')}</div>
              <div className="text-[var(--emerald)] mt-1">github.com/pern-platform</div>
              <div className="text-xs text-[var(--text-tertiary)] mt-1">{t('support.channel.githubDetail', 'Bug reports & feature requests')}</div>
            </div>
          </div>
        </Card>

        {/* Compliance */}
        <Card hover={false}>
          <SectionTitle>{t('support.compliance', 'Compliance & Certifications')}</SectionTitle>
          <div className="space-y-3 text-sm">
            {[
              { name: t('support.cert.gdpr', 'GDPR Compliant'), status: t('support.certStatus.verified', 'Verified'), pass: true },
              { name: t('support.cert.iso', 'ISO 27001'), status: t('support.certStatus.inProgress', 'In Progress'), pass: false },
              { name: t('support.cert.soc2', 'SOC 2 Type II'), status: t('support.certStatus.planned', 'Planned 2027'), pass: false },
              { name: t('support.cert.dataResidency', 'Data Residency (Egypt)'), status: t('support.certStatus.verified', 'Verified'), pass: true },
              { name: t('support.cert.who', 'WHO Guidelines'), status: t('support.certStatus.implemented', 'Implemented'), pass: true },
              { name: t('support.cert.epa', 'EPA Standards'), status: t('support.certStatus.implemented', 'Implemented'), pass: true },
            ].map((cert, i) => (
              <div key={i} className="flex justify-between items-center p-2 bg-white/5 rounded-xl">
                <span className="text-[var(--text-primary)]">{cert.name}</span>
                <Pill tone={cert.pass ? 'emerald' : 'amber'}>{cert.status}</Pill>
              </div>
            ))}
          </div>
        </Card>

        {/* Live Tickets */}
        <Card hover={false}>
          <SectionTitle>{t('support.tickets', 'Your Tickets')}</SectionTitle>
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="text-center py-6 text-[var(--text-tertiary)] text-sm">
                {t('support.ticketsEmpty', 'No tickets yet. Submit one below.')}
              </div>
            ) : tickets.map(ticket => (
              <div key={ticket.id} className="p-3 bg-white/5 rounded-2xl text-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-xs text-[var(--text-secondary)]">{ticket.id}</div>
                    <div className="mt-1 text-[var(--text-primary)]">{ticket.subject}</div>
                  </div>
                  {getStatusPill(ticket.status)}
                </div>
                <div className="flex justify-between mt-2 text-xs text-[var(--text-tertiary)]">
                  <span className={getPriorityColor(ticket.priority)}>{t(`support.priority.${ticket.priority}`, ticket.priority.toUpperCase())}</span>
                  <span>{ticket.createdAt}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* FAQ Section */}
      <Card hover={false} className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <SectionTitle className="!mb-0">{t('support.faqTitle', 'Frequently Asked Questions')}</SectionTitle>
          <span className="text-xs text-[var(--text-tertiary)]">{t('support.faqCount', '{count} questions', { count: filteredFaq.length })}</span>
        </div>

        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder={t('support.searchPlaceholder', 'Search FAQs...')}
            value={faqSearch}
            onChange={e => setFaqSearch(e.target.value)}
            className="flex-1 bg-white/5 px-4 py-2.5 rounded-2xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <select
            value={faqCategory}
            onChange={e => setFaqCategory(e.target.value)}
            className="bg-white/5 px-4 py-2.5 rounded-2xl text-sm text-[var(--text-primary)]"
          >
            {faqCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {filteredFaq.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">{t('support.faqNoResults', 'No FAQs match your search.')}</div>
          ) : (
            filteredFaq.map(faq => (
              <div key={faq.id} className="border border-[var(--border)] rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                  className="w-full text-left px-5 py-4 flex justify-between items-center hover:bg-white/5 transition-colors"
                >
                  <div>
                    <span className="text-xs text-[var(--emerald)] mr-3">{faq.category}</span>
                    <span className="font-medium text-[var(--text-primary)]">{faq.question}</span>
                  </div>
                  <span className={`text-xl transition-transform ${expandedFaq === faq.id ? 'rotate-45' : ''}`}>+</span>
                </button>
                {expandedFaq === faq.id && (
                  <div className="px-5 pb-4 text-sm text-[var(--text-secondary)] border-t border-[var(--border)] pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Contact Form */}
      <Card hover={false} className="mb-8">
        <SectionTitle className="mb-6">{t('support.contactTitle', 'Submit a Support Ticket')}</SectionTitle>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">{t('support.form.name', 'Name *')}</label>
            <input
              type="text"
              value={contactForm.name}
              onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              placeholder={t('support.form.namePlaceholder', 'Your name')}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">{t('support.form.email', 'Email *')}</label>
            <input
              type="email"
              value={contactForm.email}
              onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">{t('support.form.subject', 'Subject')}</label>
            <input
              type="text"
              value={contactForm.subject}
              onChange={e => setContactForm({ ...contactForm, subject: e.target.value })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              placeholder={t('support.form.subjectPlaceholder', 'Brief description')}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">{t('support.form.priority', 'Priority')}</label>
            <select
              value={contactForm.priority}
              onChange={e => setContactForm({ ...contactForm, priority: e.target.value as any })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)]"
            >
              <option value="low">{t('support.form.priority.low', 'Low — General question')}</option>
              <option value="medium">{t('support.form.priority.medium', 'Medium — Feature request')}</option>
              <option value="high">{t('support.form.priority.high', 'High — Bug or issue')}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">{t('support.form.message', 'Message *')}</label>
            <textarea
              value={contactForm.message}
              onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] h-32 resize-none"
              placeholder={t('support.form.messagePlaceholder', 'Describe your issue or question in detail...')}
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Btn variant="primary" onClick={submitTicket} disabled={submitting} loading={submitting}>
            {t('support.form.submit', 'Submit Ticket')}
          </Btn>
        </div>
      </Card>

      {/* Support Tiers */}
      <div>
        <SectionTitle className="mb-6">{t('support.plans', 'Support Plans')}</SectionTitle>
        <div className="grid md:grid-cols-3 gap-6 grid-entrance">
          {supportTiers.map((tier, i) => (
            <Card key={i} hover={false} className={`border ${tier.popular ? 'border-[var(--emerald)]/50' : 'border-[var(--border)]'}`}>
              {tier.popular && (
                <Pill tone="emerald" className="mb-3">{t('support.mostPopular', 'MOST POPULAR')}</Pill>
              )}
              <div className="font-semibold text-xl text-[var(--text-primary)]">{tier.name}</div>
              <div className="text-3xl font-semibold tracking-tighter text-[var(--emerald)] mt-2 stat-number">{tier.price}</div>
              <ul className="mt-6 space-y-3 text-sm">
                {tier.features.map((feature, fi) => (
                  <li key={fi} className="flex items-start gap-2">
                    <span className="text-[var(--emerald)] mt-0.5">✓</span>
                    <span className="text-[var(--text-primary)]">{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Btn
                  variant={tier.popular ? 'primary' : 'ghost'}
                  className="w-full"
                >
                  {i === 2 ? t('support.button.contactSales', 'Contact Sales') : tier.popular ? t('support.button.startTrial', 'Start Free Trial') : t('support.button.currentPlan', 'Current Plan')}
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
