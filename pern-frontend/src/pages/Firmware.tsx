import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import { showToast } from '../components/Toast';
import { PageHeader, Card, Pill, Btn, SectionTitle, EmptyState, LoadingState } from '../components/ui';
import { Cpu, Upload, RefreshCw, CheckCircle2, ArrowDown, Plus, Trash2 } from 'lucide-react';

interface DeviceFirmware {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  status: string;
  currentVersion: string;
  latestVersion: string | null;
  lastSeen: string;
  updateAvailable: boolean;
  changelog: string;
}

interface FirmwareRelease {
  id: number;
  device_type: string;
  version: string;
  changelog: string;
  download_url: string;
  released_at: string;
}

export default function FirmwarePage() {
  const [devices, setDevices] = useState<DeviceFirmware[]>([]);
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [newRelease, setNewRelease] = useState({ device_type: 'ESP32', version: '', changelog: '', download_url: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [devicesData, releasesData] = await Promise.all([
        apiClient.getDevices(),
        apiClient.getFirmwareVersions(),
      ]);

      const latestMap: Record<string, FirmwareRelease> = {};
      for (const r of releasesData) {
        if (!latestMap[r.device_type] || new Date(r.released_at) > new Date(latestMap[r.device_type].released_at)) {
          latestMap[r.device_type] = r;
        }
      }

      const enriched: DeviceFirmware[] = devicesData.map((d: any) => {
        const meta = d.metadata || {};
        const currentVersion = meta.firmware_version || 'v1.0.0';
        const deviceType = d.type || 'Generic';
        const latest = latestMap[deviceType];
        const latestVersion = latest ? latest.version : null;
        const updateAvailable = latestVersion ? currentVersion !== latestVersion : false;

        return {
          deviceId: d.id,
          deviceName: d.name || d.id,
          deviceType,
          status: d.status || 'unknown',
          currentVersion,
          latestVersion,
          lastSeen: d.last_seen || d.lastSeen || null,
          updateAvailable,
          changelog: latest ? latest.changelog : '',
        };
      });

      setDevices(enriched);
      setReleases(releasesData);
    } catch (err) {
      console.error('Failed to load firmware data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const performUpdate = async (deviceId: string, targetVersion: string) => {
    setUpdating(deviceId);
    setUpdateProgress(0);
    let interval: ReturnType<typeof setInterval> | null = null;
    try {
      interval = setInterval(() => {
        setUpdateProgress(p => {
          if (p >= 95) { if (interval) clearInterval(interval); return 95; }
          return p + Math.random() * 12 + 3;
        });
      }, 500);

      await apiClient.updateDeviceFirmware(deviceId, targetVersion);

      if (interval) clearInterval(interval);
      setUpdateProgress(100);
      showToast(`Firmware updated to ${targetVersion}`, 'success');
      await loadData();
    } catch {
      if (interval) clearInterval(interval);
      showToast('Firmware update failed', 'error');
    } finally {
      setTimeout(() => { setUpdating(null); setUpdateProgress(0); }, 800);
    }
  };

  const createRelease = async () => {
    if (!newRelease.version) { showToast('Version is required', 'error'); return; }
    try {
      await apiClient.createFirmwareVersion(newRelease);
      showToast('Firmware release created', 'success');
      setNewRelease({ device_type: 'ESP32', version: '', changelog: '', download_url: '' });
      setShowReleaseForm(false);
      await loadData();
    } catch {
      showToast('Failed to create release', 'error');
    }
  };

  const deleteRelease = async (id: number) => {
    try {
      await apiClient.deleteFirmwareVersion(id);
      showToast('Release deleted', 'success');
      await loadData();
    } catch {
      showToast('Failed to delete release', 'error');
    }
  };

  const upToDate = devices.filter(d => !d.updateAvailable).length;
  const updatesAvailable = devices.filter(d => d.updateAvailable).length;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Firmware Management"
        subtitle="OTA updates • Version tracking • Release management"
        right={
          <>
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <CheckCircle2 size={14} className="text-[var(--emerald)]" /> {upToDate} up-to-date
              {updatesAvailable > 0 && (
                <span className="text-[var(--amber)] ml-2">
                  <ArrowDown size={14} className="inline" /> {updatesAvailable} updates
                </span>
              )}
            </div>
            <Btn variant="ghost" onClick={loadData} title="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Btn>
            <Btn variant="primary" onClick={() => setShowReleaseForm(!showReleaseForm)}>
              <Plus size={14} /> New Release
            </Btn>
          </>
        }
      />

      {showReleaseForm && (
        <Card hover={false} className="mb-6">
          <SectionTitle>Create Firmware Release</SectionTitle>
          <div className="grid md:grid-cols-4 gap-3 mt-4">
            <select
              value={newRelease.device_type}
              onChange={e => setNewRelease({ ...newRelease, device_type: e.target.value })}
              className="bg-white/5 px-4 py-2.5 rounded-2xl text-sm text-[var(--text-primary)] border border-[var(--border)]"
            >
              <option value="ESP32">ESP32</option>
              <option value="NodeMCU">NodeMCU</option>
              <option value="Raspberry Pi">Raspberry Pi</option>
              <option value="ESP8266">ESP8266</option>
              <option value="Generic">Generic</option>
            </select>
            <input
              type="text"
              placeholder="Version (v2.6.0)"
              value={newRelease.version}
              onChange={e => setNewRelease({ ...newRelease, version: e.target.value })}
              className="bg-white/5 px-4 py-2.5 rounded-2xl text-sm text-[var(--text-primary)] border border-[var(--border)]"
            />
            <input
              type="text"
              placeholder="Changelog"
              value={newRelease.changelog}
              onChange={e => setNewRelease({ ...newRelease, changelog: e.target.value })}
              className="bg-white/5 px-4 py-2.5 rounded-2xl text-sm text-[var(--text-primary)] border border-[var(--border)]"
            />
            <Btn variant="primary" onClick={createRelease}>Publish</Btn>
          </div>
        </Card>
      )}

      {loading ? (
        <LoadingState label="Loading firmware data…" />
      ) : devices.length === 0 ? (
        <EmptyState
          icon={<Cpu size={22} />}
          title="No devices found"
          message="Connect devices from Device Connection first."
        />
      ) : (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 grid-entrance">
            {devices.map(d => {
              const isUpdating = updating === d.deviceId;
              return (
                <Card key={d.deviceId} hover={false}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-[var(--emerald-dim)] flex items-center justify-center">
                        <Cpu size={16} className="text-[var(--emerald)]" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-[var(--text-primary)]">{d.deviceId}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">{d.deviceType} • {d.status}</div>
                      </div>
                    </div>
                    <Pill tone={d.updateAvailable ? 'amber' : 'emerald'}>
                      {d.updateAvailable ? 'UPDATE AVAILABLE' : 'UP TO DATE'}
                    </Pill>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 rounded-xl p-3">
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Current</div>
                      <div className="font-mono text-lg font-bold mt-0.5 text-[var(--text-primary)]">{d.currentVersion}</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Latest</div>
                      <div className="font-mono text-lg font-bold mt-0.5 text-[var(--emerald)]">{d.latestVersion || 'N/A'}</div>
                    </div>
                  </div>

                  {d.changelog && (
                    <div className="text-xs text-[var(--text-tertiary)] mb-4 leading-relaxed">
                      <span className="text-[var(--text-secondary)] font-medium">Changelog:</span> {d.changelog}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                      Last seen: {d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : 'Never'}
                    </span>
                    {isUpdating ? (
                      <div className="flex-1 ml-3">
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--emerald)] transition-all duration-300"
                            style={{ width: `${Math.min(updateProgress, 100)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-[var(--emerald)] text-right mt-1">
                          {Math.round(Math.min(updateProgress, 100))}%
                        </div>
                      </div>
                    ) : d.updateAvailable && d.latestVersion ? (
                      <Btn variant="primary" size="sm" onClick={() => performUpdate(d.deviceId, d.latestVersion)}>
                        <Upload size={12} /> Update to {d.latestVersion}
                      </Btn>
                    ) : (
                      <span className="text-[10px] text-[var(--text-tertiary)]">Up to date</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <Card hover={false}>
            <div className="flex justify-between items-center mb-4">
              <SectionTitle>Firmware Release History</SectionTitle>
              <span className="text-xs text-[var(--text-tertiary)]">{releases.length} releases</span>
            </div>
            {releases.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                No firmware releases yet. Create one above.
              </div>
            ) : (
              <div className="space-y-0">
                {releases.map((release, i) => (
                  <div
                    key={release.id}
                    className="flex items-start gap-3 py-3 border-b border-[var(--border)] last:border-0"
                  >
                    <div className="w-2 h-2 rounded-full bg-[var(--emerald)] mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                          {release.version}
                        </span>
                        <Pill tone="slate">{release.device_type}</Pill>
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          {new Date(release.released_at).toLocaleDateString()}
                        </span>
                        {i === 0 && <Pill tone="emerald">Latest</Pill>}
                      </div>
                      {release.changelog && (
                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{release.changelog}</div>
                      )}
                    </div>
                    <Btn variant="ghost" size="sm" onClick={() => deleteRelease(release.id)} title="Delete release">
                      <Trash2 size={14} className="text-[var(--text-tertiary)] hover:text-[var(--rose)]" />
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
