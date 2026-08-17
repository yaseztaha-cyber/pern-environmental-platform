import { useState, useEffect } from 'react';
import { useData } from '../lib/data-provider';
import { useI18n } from '../lib/i18n';
import { useNavigate } from 'react-router';
import {
  AlertTriangle, Users, Droplet, Wind,
  Zap, ArrowRight, TrendingUp, Activity, Loader2,
  Download, FileSpreadsheet, FileText, Server, BarChart3,
  Gauge as GaugeIcon
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import { ChartGrid, ChartTooltip, CHART_CURSOR, CHART_TICK } from '../components/charts';
import { useDevice } from '../lib/device-context';
import { getEHIHistory } from '../lib/historical-data';
import { epaAQIMulti } from '../lib/epa-standards';
import { SENSOR_TYPES } from '../lib/constants';
import { apiClient } from '../lib/api-client';
import {
  PageHeader, StatCard, LiveBadge, Btn, Pill, Badge, Card,
  SectionTitle, Gauge, fmt
} from '../components/ui';

function ComplianceWindBrief({ noRealData }: { noRealData: boolean }) {
  const [compliance, setCompliance] = useState<{ countries: number; frameworks: number; overallPct: number } | null>(null);
  const [wind, setWind] = useState<{ speed: number; direction: number; gust: number } | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    apiClient.get('/v3/compliance/stats').then((r: any) => {
      if (r) setCompliance({ countries: r.countries ?? 0, frameworks: r.frameworks ?? 0, overallPct: r.overallPct ?? r.averageCompliance ?? 0 });
    }).catch(() => {});
    apiClient.get('/v3/wind/forecast').then((r: any) => {
      if (Array.isArray(r) && r.length > 0) setWind({ speed: r[0].speed, direction: r[0].direction, gust: r[0].gust });
    }).catch(() => {});
  }, []);
  if (noRealData) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 md:mb-6 grid-entrance">
      <Card hover={false} className="flex items-center gap-4 p-4">
        <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--emerald-dim)] flex items-center justify-center shrink-0">
          <BarChart3 size={18} className="text-[var(--emerald)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--text-tertiary)] font-medium">Compliance Overview</div>
          {compliance ? (
            <div className="flex items-center gap-4 mt-1.5">
              <div><span className="text-lg font-bold tabular-nums text-[var(--emerald)]">{compliance.countries}</span> <span className="text-xs text-[var(--text-tertiary)]">countries</span></div>
              <div><span className="text-lg font-bold tabular-nums text-[var(--cyan)]">{compliance.frameworks}</span> <span className="text-xs text-[var(--text-tertiary)]">frameworks</span></div>
              <div><span className="text-lg font-bold tabular-nums text-[var(--violet)]">{compliance.overallPct}%</span> <span className="text-xs text-[var(--text-tertiary)]">avg compliance</span></div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-disabled)] mt-1">Loading compliance data…</div>
          )}
        </div>
        <Btn variant="ghost" size="sm" onClick={() => navigate('/analytics')}>Details</Btn>
      </Card>
      <Card hover={false} className="flex items-center gap-4 p-4">
        <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--cyan-dim)] flex items-center justify-center shrink-0">
          <Wind size={18} className="text-[var(--cyan)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--text-tertiary)] font-medium">Current Wind</div>
          {wind ? (
            <div className="flex items-center gap-4 mt-1.5">
              <div><span className="text-lg font-bold tabular-nums text-[var(--cyan)]">{fmt(wind.speed)}</span> <span className="text-xs text-[var(--text-tertiary)]">m/s</span></div>
              <div><span className="text-lg font-bold tabular-nums text-[var(--text-primary)]">{wind.direction}°</span> <span className="text-xs text-[var(--text-tertiary)]">direction</span></div>
              <div><span className="text-lg font-bold tabular-nums text-[var(--amber)]">{fmt(wind.gust)}</span> <span className="text-xs text-[var(--text-tertiary)]">gust</span></div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-disabled)] mt-1">Loading wind data…</div>
          )}
        </div>
        <Btn variant="ghost" size="sm" onClick={() => navigate('/map')}>Map</Btn>
      </Card>
    </div>
  );
}

function EhiTrendChart({ ehi: _ehi }: { ehi: number }) {
  const { selectedDevice } = useDevice();
  const history = getEHIHistory(selectedDevice?.id);

  if (history.length < 2) {
    return (
      <div className="h-40 md:h-56 flex flex-col items-center justify-center text-[var(--text-disabled)] text-sm gap-2">
        <TrendingUp size={18} className="opacity-40" />
        <span>Not enough readings for trend</span>
      </div>
    );
  }

  const data = history.map((v, i) => ({ t: i + 1, ehi: v }));

  return (
    <div className="h-40 md:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <ChartGrid />
          <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
          <Line
            type="natural"
            dataKey="ehi"
            name="EHI"
            stroke="var(--emerald)"
            strokeWidth={2.5}
            dot={{ fill: 'var(--emerald)', strokeWidth: 2, r: 3 }}
            activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--emerald)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function computeAQI(pm25: number | null): number {
  return epaAQIMulti({ pm25: pm25 ?? undefined });
}
function computeWQI(ph: number | null): number {
  const pH = ph ?? 7.2;
  return Math.round(Math.abs(pH - 7.15) * 18);
}

function ExportDropdown() {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (type: 'csv-readings' | 'csv-alerts') => {
    setExporting(true);
    try {
      if (type === 'csv-readings') {
        await apiClient.downloadCSV(apiClient.exportReadingsCSV(500), 'readings.csv');
      } else {
        await apiClient.downloadCSV(apiClient.exportAlertsCSV(200), 'alerts.csv');
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Btn variant="ghost" size="sm" onClick={() => setOpen(!open)} disabled={exporting}>
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        <span className="hidden sm:inline">Export</span>
      </Btn>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-lg py-1 min-w-[180px] animate-pop">
            <button onClick={() => handleExport('csv-readings')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
              <FileSpreadsheet size={14} /> Sensor Data (CSV)
            </button>
            <button onClick={() => handleExport('csv-alerts')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
              <FileText size={14} /> Alert History (CSV)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data, isLive, setLiveMode, mqttConnected, lastUpdate, simulateNewReading, canSimulate, hasRealData } = useData();
  const { selectedDevice, connectedDevices } = useDevice();
  const navigate = useNavigate();
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [backendHealth, setBackendHealth] = useState<{ status: string; uptime: number; mqtt: boolean; db: string } | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    apiClient.getHealth().then((h: any) => setBackendHealth({ status: h.status, uptime: h.uptime, mqtt: h.mqtt, db: h.db })).catch(() => {});
  }, []);

  const noRealData = isLive && !hasRealData;
  const ehiValid = data.ehi >= 0;

  const getEhiCategory = (score: number) => {
    if (score >= 80) return { label: t('dashboard.ehi.category.excellent'), color: 'emerald' as const };
    if (score >= 60) return { label: t('dashboard.ehi.category.good'), color: 'emerald' as const };
    if (score >= 40) return { label: t('dashboard.ehi.category.moderate'), color: 'amber' as const };
    if (score >= 20) return { label: t('dashboard.ehi.category.poor'), color: 'rose' as const };
    return { label: t('dashboard.ehi.category.critical'), color: 'rose' as const };
  };

  const category = ehiValid ? getEhiCategory(data.ehi) : { label: 'No Data', color: 'slate' as const };

  const aqiSensor = data.virtualSensors.find(v => v.id === 'aqi');
  const wqiSensor = data.virtualSensors.find(v => v.id === 'wqi');

  const activeAlerts = data.virtualSensors.filter(v => v.category === 'poor' || v.category === 'critical').length;
  const connectedCount = connectedDevices.filter(d => d.status === 'connected').length;

  const aqiValue = aqiSensor ? aqiSensor.value : (noRealData ? '—' : computeAQI(data.physical.pm25));
  const wqiValue = wqiSensor ? wqiSensor.value : (noRealData ? '—' : computeWQI(data.physical.ph));

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title={t('dashboard.title.page')}
        subtitle={`${data.location}${selectedDevice ? ` · ${selectedDevice.name}` : ''}`}
        right={
          <div className="flex items-center gap-2">
            <LiveBadge on={isLive && mqttConnected} />
            <ExportDropdown />
            <Btn
              variant={isLive ? 'primary' : 'ghost'}
              onClick={() => {
                setIsSwitchingMode(true);
                setLiveMode(!isLive);
                setTimeout(() => setIsSwitchingMode(false), 600);
              }}
            >
              {isLive ? t('dashboard.mode.live') : t('dashboard.mode.simulation')}
            </Btn>
            <Btn variant="ghost" disabled={!canSimulate || isLive} onClick={simulateNewReading}>
              <Zap size={14} /> Generate
            </Btn>
          </div>
        }
      />

      {isSwitchingMode && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in">
          <div className="glass rounded-[var(--radius-lg)] px-6 py-4 flex items-center gap-3">
            <Loader2 size={18} className="animate-spin text-[var(--emerald)]" />
            <span className="text-sm font-medium">{t('dashboard.switchingMode', undefined, { mode: isLive ? t('dashboard.mode.live') : t('dashboard.mode.simulation') })}</span>
          </div>
        </div>
      )}

      {/* EHI Hero */}
      <Card className="mb-4 md:mb-6 stagger-1" hover={false}>
        <div className="p-4 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
          <div className="flex items-center gap-4 md:gap-6">
            <Gauge value={ehiValid ? data.ehi : 0} max={100} size={96} label="EHI" unit="%" />
            <div>
              <SectionTitle className="text-[var(--emerald)] !mb-1">{t('dashboard.ehi.label')}</SectionTitle>
              <div className="text-3xl md:text-[48px] font-bold tracking-tighter mt-1">{ehiValid ? fmt(data.ehi) : '—'}</div>
              <div className="flex items-center gap-3 mt-2">
                <Pill tone={category.color}>{category.label}</Pill>
                {ehiValid && (
                  <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline">
                    Updated {new Date(lastUpdate).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="ghost" size="sm" onClick={() => navigate('/virtual-sensors')}>
              <GaugeIcon size={13} /> Virtual
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => navigate('/sensors')}>
              <Activity size={13} /> Sensors
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => navigate('/ai')}>
              <TrendingUp size={13} /> AI Analysis <ArrowRight size={13} />
            </Btn>
          </div>
        </div>
      </Card>

      {/* Quick Stats — 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 mb-4 md:mb-6 grid-entrance">
        <StatCard label={t('dashboard.stat.airQualityIndex')} value={aqiValue} unit="AQI" accent="emerald" icon={<Wind size={16} />} />
        <StatCard label={t('dashboard.stat.waterQualityIndex')} value={wqiValue} unit="WQI" accent="cyan" icon={<Droplet size={16} />} />
        <StatCard label={t('dashboard.stat.activeAlerts')} value={noRealData ? '—' : activeAlerts} accent="rose" icon={<AlertTriangle size={16} />} />
        <StatCard label={t('dashboard.stat.connectedDevices')} value={noRealData ? '—' : connectedCount} accent="violet" icon={<Users size={16} />} />
      </div>

      {/* Compliance & Wind Brief */}
      <ComplianceWindBrief noRealData={noRealData} />

      {/* EHI Trend */}
      <Card className="mb-4 md:mb-6 stagger-3" hover={false}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-semibold text-[var(--text-primary)]">{t('dashboard.chart.ehiTrendTitle')}</div>
            <div className="text-xs text-[var(--text-tertiary)] flex items-center gap-1 mt-0.5">
              <TrendingUp size={12} /> {category.label} {t('dashboard.chart.trendSuffix')}
            </div>
          </div>
          <Btn variant="ghost" size="sm" onClick={() => navigate('/analytics')}>
            {t('dashboard.button.viewAnalytics')} <ArrowRight size={12} />
          </Btn>
        </div>
        {ehiValid ? (
          <EhiTrendChart ehi={data.ehi} />
        ) : (
          <div className="h-40 md:h-56 flex items-center justify-center text-[var(--text-disabled)] text-sm">
            {noRealData ? 'Awaiting real EHI data from connected devices…' : 'No trend data yet.'}
          </div>
        )}
      </Card>

      {/* Virtual Sensors — 2 cols mobile, 3 cols md, 5 cols lg */}
      <div className="mb-4 md:mb-6">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle className="flex items-center gap-2 !mb-0">
            <Activity size={16} className="text-[var(--emerald)]" /> {t('dashboard.section.virtualSensors')}
          </SectionTitle>
          <Btn variant="ghost" size="sm" onClick={() => navigate('/sensors')}>
            {t('dashboard.button.viewAll')} <ArrowRight size={12} />
          </Btn>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3 grid-entrance">
          {data.virtualSensors.slice(0, 5).map((vs, idx) => (
            <Card key={idx} className="flex flex-col p-3 md:p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-[10px] md:text-xs text-[var(--text-tertiary)]">{vs.name}</div>
                  <div className="text-xl md:text-2xl font-bold tracking-tight mt-1 text-[var(--text-primary)]">{fmt(vs.value)}</div>
                  <div className="text-[10px] md:text-[11px] text-[var(--text-disabled)]">{vs.unit}</div>
                </div>
                <Badge category={vs.category} />
              </div>
              <div className="mt-auto pt-2 text-[9px] md:text-[10px] text-[var(--text-disabled)] line-clamp-2 font-mono">{vs.formula}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* Live Physical Sensors — 3 cols mobile, 5 cols md, 7 cols lg */}
      {backendHealth && (
        <Card hover={false} className="mb-4 md:mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Server size={14} className="text-[var(--text-tertiary)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">System Health</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${backendHealth.status === 'ok' ? 'bg-[var(--emerald)]' : 'bg-[var(--rose)]'}`} />
              Backend <span className="text-[var(--text-disabled)]">v2.7.0</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${mqttConnected ? 'bg-[var(--emerald)]' : 'bg-[var(--amber)]'}`} />
              MQTT {mqttConnected ? 'Connected' : 'Disconnected'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${backendHealth.db.startsWith('ok') ? 'bg-[var(--emerald)]' : 'bg-[var(--amber)]'}`} />
              Database {backendHealth.db}
            </span>
            <span className="text-[var(--text-disabled)]">
              Uptime {Math.floor(backendHealth.uptime / 60)}m
            </span>
            <span className="text-[var(--text-disabled)]">
              {Object.keys(data.physical).length} active sensors
            </span>
          </div>
        </Card>
      )}

      {/* Live Physical Sensors — 3 cols mobile, 5 cols md, 7 cols lg */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle className="flex items-center gap-2 !mb-0">
            <Wind size={16} className="text-[var(--cyan)]" /> {t('dashboard.section.livePhysicalSensors')}
            <LiveBadge on={isLive && mqttConnected} label={isLive && mqttConnected ? 'STREAMING' : 'STATIC'} />
          </SectionTitle>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-1.5 md:gap-2 grid-entrance">
          {Object.entries(data.physical).map(([key, value]) => {
            const meta = SENSOR_TYPES[key as keyof typeof SENSOR_TYPES];
            return (
              <Card key={key} hover={false} className="text-center py-3 md:py-4 px-2 md:px-3">
                <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-[var(--text-disabled)] mb-1">{meta?.name ?? key}</div>
                <div className="text-base md:text-xl font-bold tabular-nums text-[var(--text-primary)]">{fmt(value)}<span className="text-[10px] md:text-xs font-normal text-[var(--text-disabled)] ml-0.5">{meta?.unit ?? ''}</span></div>
              </Card>
            );
          })}
        </div>
        {isLive && !hasRealData && (
          <div className="mt-3 p-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] text-center text-[var(--text-tertiary)] text-xs">
            {selectedDevice
              ? <>Viewing <span className="text-[var(--emerald)]">{selectedDevice.name}</span> — waiting for data.</>
              : <>No device data. Connect one from <span className="text-[var(--emerald)]">Connect Device</span>.</>}
          </div>
        )}
      </div>
    </div>
  );
}
