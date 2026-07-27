import { useState, useEffect } from 'react';
import { Settings, Bell, Database, Mail, Hash, Save } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { PageHeader, Card, Pill, LoadingState, Toggle } from '../components/ui';

interface OrgSettings {
  id: string;
  name: string;
  description: string;
  dataRetentionDays: number;
  alertPreferences: {
    ntfy: boolean;
    email: boolean;
    slack: boolean;
  };
}

export default function OrganizationSettings() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [retentionDays, setRetentionDays] = useState(90);
  const [ntfyEnabled, setNtfyEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [slackEnabled, setSlackEnabled] = useState(false);

  useEffect(() => {
    apiClient.getOrganizations().then((data: any) => {
      setOrgs(data);
      if (data.length > 0) {
        const org = data[0];
        setSelectedOrg(org);
        setName(org.name || '');
        setDescription(org.description || '');
        setRetentionDays(org.dataRetentionDays ?? 90);
        const prefs = org.alertPreferences ?? {};
        setNtfyEnabled(prefs.ntfy ?? true);
        setEmailEnabled(prefs.email ?? true);
        setSlackEnabled(prefs.slack ?? false);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!selectedOrg) return;
    setSaving(true);
    try {
      const payload = {
        name,
        description,
        dataRetentionDays: retentionDays,
        alertPreferences: { ntfy: ntfyEnabled, email: emailEnabled, slack: slackEnabled },
      };
      await apiClient.put(`/organizations/${selectedOrg.id}`, payload);
    } catch (err) {
      console.error('Failed to save org settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading organization settings..." />;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Organization Settings"
        subtitle={selectedOrg ? `Manage ${selectedOrg.name}` : 'No organization selected'}
        right={
          orgs.length > 1 ? (
            <select
              value={selectedOrg?.id || ''}
              onChange={(e) => {
                const org = orgs.find((o) => o.id === e.target.value);
                if (org) {
                  setSelectedOrg(org);
                  setName(org.name || '');
                  setDescription(org.description || '');
                  setRetentionDays(org.dataRetentionDays ?? 90);
                  const prefs = org.alertPreferences ?? {};
                  setNtfyEnabled(prefs.ntfy ?? true);
                  setEmailEnabled(prefs.email ?? true);
                  setSlackEnabled(prefs.slack ?? false);
                }
              }}
              aria-label="Select organization"
              className="bg-[var(--surface)] text-sm px-3 py-2 rounded-[var(--radius-md)]"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          ) : undefined
        }
      />

      {selectedOrg && (
        <>
          <Card hover={false}>
            <div className="flex items-center gap-2 mb-5">
              <Settings size={16} className="text-[var(--emerald)]" />
              <span className="font-semibold">General</span>
            </div>
            <div className="space-y-5">
              <div>
                <label className="text-xs text-[var(--text-tertiary)] block mb-1.5" htmlFor="org-name">Organization Name</label>
                <input
                  id="org-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Organization name"
                  className="w-full bg-[var(--surface)] px-4 py-3 rounded-[var(--radius-sm)] text-lg"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)] block mb-1.5" htmlFor="org-desc">Description</label>
                <input
                  id="org-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-label="Organization description"
                  className="w-full bg-[var(--surface)] px-4 py-3 rounded-[var(--radius-sm)]"
                />
              </div>
            </div>
          </Card>

          <Card hover={false} className="mt-5">
            <div className="flex items-center gap-2 mb-5">
              <Database size={16} className="text-[var(--cyan)]" />
              <span className="font-semibold">Data Retention</span>
              <Pill tone="cyan">{retentionDays} days</Pill>
            </div>
            <div>
              <label className="text-xs text-[var(--text-tertiary)] block mb-1.5" htmlFor="retention-days">Retention Period (days)</label>
              <input
                id="retention-days"
                type="number"
                min={1}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                aria-label="Data retention days"
                className="w-full bg-[var(--surface)] px-4 py-3 rounded-[var(--radius-sm)]"
              />
            </div>
          </Card>

          <Card hover={false} className="mt-5">
            <div className="flex items-center gap-2 mb-5">
              <Bell size={16} className="text-[var(--amber)]" />
              <span className="font-semibold">Notification Channels</span>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-[var(--text-tertiary)]" />
                  <span className="text-sm">Ntfy Push</span>
                </div>
                <Toggle checked={ntfyEnabled} onChange={setNtfyEnabled} label="Ntfy notifications toggle" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-[var(--text-tertiary)]" />
                  <span className="text-sm">Email</span>
                </div>
                <Toggle checked={emailEnabled} onChange={setEmailEnabled} label="Email notifications toggle" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash size={14} className="text-[var(--text-tertiary)]" />
                  <span className="text-sm">Slack</span>
                </div>
                <Toggle checked={slackEnabled} onChange={setSlackEnabled} label="Slack notifications toggle" />
              </div>
            </div>
          </Card>

          <button
            onClick={handleSave}
            disabled={saving}
            aria-label="Save organization settings"
            className="mt-6 w-full py-4 bg-[var(--emerald)] hover:opacity-90 rounded-[var(--radius-sm)] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      )}
    </div>
  );
}
