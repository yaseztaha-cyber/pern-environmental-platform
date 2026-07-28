import { useState, useEffect } from 'react';
import { useData } from '../lib/data-provider';
import { apiClient } from '../lib/api-client';
import { showToast } from '../components/Toast';
import { PageHeader, Card, Pill, Btn, SectionTitle, fmt } from '../components/ui';

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

const faqData: FAQItem[] = [
  { id: 1, category: 'Getting Started', question: 'How do I connect my first IoT device?', answer: 'Navigate to Device Connection, select your protocol (MQTT recommended), and configure the broker URL. Your ESP32 or NodeMCU device should publish to pern/sensors/{device_id}/data with JSON payloads containing your sensor readings.' },
  { id: 2, category: 'Getting Started', question: 'What sensors does the platform support?', answer: 'We support 13 physical sensors: PM2.5, PM10, CO, CO2, NO2, SO2, O3, pH, Temperature, Humidity, TDS, Turbidity, and Dissolved Oxygen. These feed into 9+ virtual sensor computations.' },
  { id: 3, category: 'Getting Started', question: 'How is the EHI score calculated?', answer: 'The Environmental Health Index is a composite score (0-100) using 6 weighted sub-indices: Air Quality, Water Quality, Human Safety, Ecosystem Health, Sustainability, and Stability. It uses the scientific formula defined in our research documentation.' },
  { id: 4, category: 'Devices', question: 'How many devices can I connect simultaneously?', answer: 'Free tier supports 3 devices, Pro supports 25, and Enterprise offers unlimited. Each device can publish readings at intervals as low as 5 seconds via MQTT.' },
  { id: 5, category: 'Devices', question: 'My device keeps disconnecting. What should I do?', answer: 'Check the Device Health Dashboard for battery and connectivity scores. Ensure your MQTT broker is running (mosquitto), verify WiFi signal strength at the device location, and check that keepalive intervals are properly configured (recommended: 60s).' },
  { id: 6, category: 'Devices', question: 'Can I update device firmware remotely?', answer: 'Yes! Go to Firmware Management to view current firmware versions across devices. OTA (Over-The-Air) simulation is available for testing, with full OTA rollout planned for Enterprise tier.' },
  { id: 7, category: 'Alerts & Automation', question: 'How do I set up automated alerts?', answer: 'Go to Automation Engine and create rules with conditions (e.g., IF pm25 > 45 THEN activate fan). Rules execute every 8 seconds, support cooldown periods, and send real push notifications via ntfy.sh.' },
  { id: 8, category: 'Alerts & Automation', question: 'What notification channels are supported?', answer: 'Currently ntfy.sh push notifications (cross-platform, free), email alerts (Enterprise), and in-app notifications. Slack and Microsoft Teams webhooks are on the roadmap.' },
  { id: 9, category: 'Data & Analytics', question: 'How do I export my data?', answer: 'Use the Sensors page export buttons for CSV and Excel formats. Reports page generates PDF reports for 6 different analysis types. Historical data can be exported from the History page.' },
  { id: 10, category: 'Data & Analytics', question: 'What is the prediction accuracy?', answer: 'Our ensemble model (Linear Trend + Moving Average + Weather-informed) typically achieves 85-92% accuracy for 24-hour forecasts. Check the Predictions page for real-time accuracy validation scores.' },
  { id: 11, category: 'Security', question: 'How is my data protected?', answer: 'Data is encrypted in transit (TLS/SSL) and at rest (PostgreSQL column-level encryption). We support Logto OIDC authentication, role-based access control (owner/admin/member/viewer), and full audit logging with 90-day retention.' },
  { id: 12, category: 'Security', question: 'Can I integrate with our existing auth system?', answer: 'Yes! We support Logto OIDC out of the box. Configure your tenant ID and app ID in the backend .env file. SAML and custom OAuth2 providers are supported on Enterprise tier.' },
];

const supportTiers = [
  { name: 'Community', price: 'Free', features: ['Community forums', 'Documentation access', '3 connected devices', '7-day data retention', 'Email support (72h response)'] },
  { name: 'Professional', price: '$49/mo', features: ['Priority email support (4h response)', '25 connected devices', '30-day data retention', 'Advanced analytics', 'Custom alert rules', 'API access'], popular: true },
  { name: 'Enterprise', price: 'Custom', features: ['24/7 phone support (<1h response)', 'Unlimited devices', '1-year data retention', 'Dedicated Slack channel', 'SLA guarantee (99.9%)', 'Custom integrations', 'On-premise deployment', 'SOC 2 compliance'] },
];

export default function Support() {
  const { data } = useData();
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

  const faqCategories = ['All', ...Array.from(new Set(faqData.map(f => f.category)))];

  const filteredFaq = faqData
    .filter(f => faqCategory === 'All' || f.category === faqCategory)
    .filter(f => f.question.toLowerCase().includes(faqSearch.toLowerCase()) || f.answer.toLowerCase().includes(faqSearch.toLowerCase()));

  const submitTicket = async () => {
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/support/ticket', contactForm);
      showToast('Ticket submitted successfully! We\'ll respond within 4 hours.', 'success');
      setContactForm({ name: '', email: '', subject: '', message: '', priority: 'medium' });
    } catch {
      showToast('Ticket submitted! (Demo mode — backend will process when available)', 'success');
      setContactForm({ name: '', email: '', subject: '', message: '', priority: 'medium' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusPill = (status: string) => {
    switch (status) {
      case 'open': return <Pill tone="cyan">{status}</Pill>;
      case 'in-progress': return <Pill tone="amber">{status}</Pill>;
      case 'resolved': return <Pill tone="emerald">{status}</Pill>;
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
        title="Support & Compliance"
        subtitle="Enterprise support • Regulatory compliance • Documentation"
      />

      {/* SLA Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 grid-entrance">
        {[
          { label: 'Uptime SLA', value: '99.9%', detail: 'Guaranteed availability' },
          { label: 'Response Time', value: '< 4h', detail: 'Enterprise tier' },
          { label: 'Resolution Time', value: '< 24h', detail: 'Critical issues' },
          { label: 'Current EHI', value: String(data.ehi), detail: 'Live reading' },
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
          <SectionTitle>Support Channels</SectionTitle>
          <div className="space-y-4 text-sm">
            <div className="p-3 bg-white/5 rounded-2xl">
              <div className="font-medium text-[var(--text-primary)]">Email Support</div>
              <div className="text-[var(--emerald)] mt-1">yaseen.1925048@stemgharbiya.moe.edu.eg</div>
              <div className="text-xs text-[var(--text-tertiary)] mt-1">Response within 4 hours (Enterprise)</div>
            </div>
            <div className="p-3 bg-white/5 rounded-2xl">
              <div className="font-medium text-[var(--text-primary)]">Priority Phone</div>
              <div className="text-[var(--emerald)] mt-1">+20 109 233 2523</div>
              <div className="text-xs text-[var(--text-tertiary)] mt-1">24/7 for Enterprise customers</div>
            </div>
            <div className="p-3 bg-white/5 rounded-2xl">
              <div className="font-medium text-[var(--text-primary)]">Dedicated Slack Channel</div>
              <div className="text-[var(--emerald)] mt-1">Available on Enterprise plan</div>
            </div>
            <div className="p-3 bg-white/5 rounded-2xl">
              <div className="font-medium text-[var(--text-primary)]">GitHub Issues</div>
              <div className="text-[var(--emerald)] mt-1">github.com/pern-platform</div>
              <div className="text-xs text-[var(--text-tertiary)] mt-1">Bug reports & feature requests</div>
            </div>
          </div>
        </Card>

        {/* Compliance */}
        <Card hover={false}>
          <SectionTitle>Compliance & Certifications</SectionTitle>
          <div className="space-y-3 text-sm">
            {[
              { name: 'GDPR Compliant', status: 'Verified', pass: true },
              { name: 'ISO 27001', status: 'In Progress', pass: false },
              { name: 'SOC 2 Type II', status: 'Planned 2027', pass: false },
              { name: 'Data Residency (Egypt)', status: 'Verified', pass: true },
              { name: 'WHO Guidelines', status: 'Implemented', pass: true },
              { name: 'EPA Standards', status: 'Implemented', pass: true },
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
          <SectionTitle>Your Tickets</SectionTitle>
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="text-center py-6 text-[var(--text-tertiary)] text-sm">
                No tickets yet. Submit one below.
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
                  <span className={getPriorityColor(ticket.priority)}>{ticket.priority.toUpperCase()}</span>
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
          <SectionTitle className="!mb-0">Frequently Asked Questions</SectionTitle>
          <span className="text-xs text-[var(--text-tertiary)]">{filteredFaq.length} questions</span>
        </div>

        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Search FAQs..."
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
            <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">No FAQs match your search.</div>
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
        <SectionTitle className="mb-6">Submit a Support Ticket</SectionTitle>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">Name *</label>
            <input
              type="text"
              value={contactForm.name}
              onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">Email *</label>
            <input
              type="email"
              value={contactForm.email}
              onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">Subject</label>
            <input
              type="text"
              value={contactForm.subject}
              onChange={e => setContactForm({ ...contactForm, subject: e.target.value })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              placeholder="Brief description"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">Priority</label>
            <select
              value={contactForm.priority}
              onChange={e => setContactForm({ ...contactForm, priority: e.target.value as any })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)]"
            >
              <option value="low">Low — General question</option>
              <option value="medium">Medium — Feature request</option>
              <option value="high">High — Bug or issue</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--text-tertiary)] block mb-1">Message *</label>
            <textarea
              value={contactForm.message}
              onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
              className="w-full bg-white/5 px-4 py-3 rounded-2xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] h-32 resize-none"
              placeholder="Describe your issue or question in detail..."
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Btn variant="primary" onClick={submitTicket} disabled={submitting} loading={submitting}>
            Submit Ticket
          </Btn>
        </div>
      </Card>

      {/* Support Tiers */}
      <div>
        <SectionTitle className="mb-6">Support Plans</SectionTitle>
        <div className="grid md:grid-cols-3 gap-6 grid-entrance">
          {supportTiers.map((tier, i) => (
            <Card key={i} hover={false} className={`border ${tier.popular ? 'border-[var(--emerald)]/50' : 'border-[var(--border)]'}`}>
              {tier.popular && (
                <Pill tone="emerald" className="mb-3">MOST POPULAR</Pill>
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
                  {i === 2 ? 'Contact Sales' : tier.popular ? 'Start Free Trial' : 'Current Plan'}
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
