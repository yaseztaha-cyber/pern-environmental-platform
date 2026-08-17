import { useMemo } from 'react';
import { useData } from '../lib/data-provider';
import { SENSOR_TYPES } from '../lib/constants';
import { exportToCSV, exportToExcel } from '../lib/export-utils';
import { showToast } from '../components/Toast';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { useI18n } from '../lib/i18n';
import { epaAQIMulti, aqiCategory, WHO_GUIDELINES } from '../lib/epa-standards';
import { computeEstimatedSensors } from '../lib/virtual-sensor-estimators';
import { PageHeader, Card, Pill, Btn, Badge, fmt, Gauge, ProgressBar } from '../components/ui';
import { Download, FileSpreadsheet, Activity, Cpu, CheckCircle2, AlertTriangle, Sigma, Gauge as GaugeIcon } from 'lucide-react';

export default function SensorsPage() {
  return (
    <PageErrorBoundary pageName="Sensors">
      <SensorsContent />
    </PageErrorBoundary>
  );
}

function SensorsContent() {
  const { data, updatePhysicalReading, isLive } = useData();
  const { t } = useI18n();

  const totalVirtual = data.virtualSensors.length;
  const avgConfidence = totalVirtual > 0
    ? Math.round(data.virtualSensors.reduce((s, v) => s + v.confidence, 0) / totalVirtual)
    : 0;

  const estimatedResult = useMemo(() => computeEstimatedSensors(data.physical), [data.physical]);
  const estimated = estimatedResult.all;

  const aqi = useMemo(() => {
    const p = data.physical;
    return epaAQIMulti({ pm25: p.pm25, pm10: p.pm10, no2: p.no2, so2: p.so2, co: p.co });
  }, [data.physical]);
  const aqiCat = useMemo(() => aqiCategory(aqi), [aqi]);

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title={t('sensors.title', 'Live Sensor Monitoring')}
        subtitle={t('sensors.subtitle', '13 physical sensors + 10 virtual soft sensors')}
        right={
          <div className="flex items-center gap-2">
            <Pill tone={isLive ? 'emerald' : 'slate'}>
              {isLive ? t('sensors.badge.liveFromMqtt', 'LIVE FROM MQTT') : t('sensors.badge.simulationMode', 'SIMULATION MODE')}
            </Pill>
            <Btn variant="ghost" size="sm" onClick={() => { exportToCSV(data, 'pern-sensors'); showToast(t('sensors.toast.csvExportSuccess', 'CSV exported successfully!'), 'success'); }}>
              <Download size={13} /> .csv
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => { exportToExcel(data, 'pern-sensors'); showToast(t('sensors.toast.excelExportSuccess', 'Excel file downloaded!'), 'success'); }}>
              <FileSpreadsheet size={13} /> .xlsx
            </Btn>
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 grid-entrance">
        <div className="rounded-[var(--radius-md)] p-4 bg-[var(--emerald-dim)] border-l-[3px] border-l-[var(--emerald)]">
          <div className="section-label">{t('sensors.section.physicalSensors', 'Physical Sensors (13)')}</div>
          <div className="text-2xl font-bold stat-number text-[var(--emerald)]">{Object.keys(data.physical).length}</div>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 bg-[var(--cyan-dim)] border-l-[3px] border-l-[var(--cyan)]">
          <div className="section-label">{t('sensors.section.virtualSensors', 'Virtual Sensors (Soft Sensors)')}</div>
          <div className="text-2xl font-bold stat-number text-[var(--cyan)]">{totalVirtual}</div>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 bg-[rgba(34,211,238,0.08)] border-l-[3px] border-l-[var(--cyan)]">
          <div className="section-label">{t('sensors.estimated', 'Estimated')}</div>
          <div className="text-2xl font-bold stat-number text-[var(--cyan)]">{estimated.length}</div>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 bg-[rgba(167,139,250,0.08)] border-l-[3px] border-l-[var(--violet)]">
          <div className="section-label">{t('sensors.label.confidence', 'Confidence')}</div>
          <div className="text-2xl font-bold stat-number text-[var(--violet)]">{avgConfidence}%</div>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 bg-[var(--amber-dim)] border-l-[3px] border-l-[var(--amber)]">
          <div className="section-label">{t('sensors.status', 'Status')}</div>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-[var(--emerald)] animate-pulse-glow' : 'bg-white/20'}`} />
            <span className="text-sm font-medium">{isLive ? t('sensors.streaming', 'Streaming') : t('sensors.static', 'Static')}</span>
          </div>
        </div>
      </div>

      {/* AQI Gauge */}
      <Card hover={false} className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-[var(--text-tertiary)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">EPA AQI</span>
          </div>
          <Pill tone={aqi <= 50 ? 'emerald' : aqi <= 100 ? 'amber' : 'rose'}>{aqiCat.label}</Pill>
        </div>
        <div className="flex items-center gap-4">
          <Gauge value={aqi} max={500} size={100} label="AQI" />
          <div className="flex-1">
            <div className="h-3 rounded-full bg-white/5 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-[#00e400] via-[#ffff00] via-[#ff7e00] via-[#ff0000] to-[#7e0023] opacity-40" />
              <div
                className="h-full rounded-full transition-all duration-700 bg-white/80 shadow-lg"
                style={{ width: `${Math.min(100, (aqi / 300) * 100)}%` }}
              />
              <div
                className="absolute top-0 w-1 h-full bg-white rounded-full transition-all duration-700 shadow-white-glow"
                style={{ left: `${Math.min(100, (aqi / 300) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-[var(--text-disabled)]">
              <span>0</span><span>50 {t('sensors.aqiGood', 'Good')}</span><span>100 {t('sensors.aqiModerate', 'Mod')}</span><span>150 {t('sensors.aqiUsg', 'USG')}</span><span>300+ {t('sensors.aqiHazard', 'Hazard')}</span>
            </div>
          </div>
        </div>
        <div className="text-xs text-[var(--text-tertiary)] mt-2">{aqiCat.healthAdvice}</div>
      </Card>

      {/* Physical Sensors */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <Cpu size={16} className="text-[var(--emerald)]" />
          <h3 className="font-semibold">{t('sensors.section.physicalSensors', 'Physical Sensors (13)')}</h3>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 grid-entrance">
          {Object.entries(data.physical).map(([key, value]) => {
            const meta = SENSOR_TYPES[key as keyof typeof SENSOR_TYPES];
            if (!meta) return null;

            const inRange = value >= meta.safeRange[0] && value <= meta.safeRange[1];
            const pct = Math.min(100, Math.max(0, ((value - meta.safeRange[0]) / (meta.safeRange[1] - meta.safeRange[0])) * 100));

            return (
              <Card key={key} hover={false} className="!p-0 overflow-hidden">
                <div className={`h-1 ${inRange ? 'bg-[var(--emerald)]' : 'bg-[var(--amber)]'}`} />
                <div className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">{meta.name}</div>
                      <div className="text-[36px] font-bold tabular-nums tracking-tighter leading-none mt-2 text-[var(--text-primary)]">
                        {fmt(value)}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-1">{meta.unit}</div>
                    </div>
                    <Pill tone={inRange ? 'emerald' : 'amber'}>{inRange ? t('sensors.safe', 'Safe') : t('sensors.check', 'Check')}</Pill>
                  </div>

                  {/* Range bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] text-[var(--text-disabled)] mb-1 font-mono">
                      <span>{meta.safeRange[0]}</span>
                      <span>{meta.safeRange[1]}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${inRange ? 'bg-[var(--emerald)]' : 'bg-[var(--amber)]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {!isLive && (
                    <input
                      type="range"
                      min={meta.safeRange[0]}
                      max={meta.safeRange[1] + 20}
                      step="0.1"
                      value={value}
                      onChange={(e) => updatePhysicalReading(key, parseFloat(e.target.value))}
                      className="mt-3 w-full"
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Virtual Sensors */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Activity size={16} className="text-[var(--violet)]" />
          <h3 className="font-semibold">{t('sensors.section.virtualSensors', 'Virtual Sensors (Soft Sensors)')}</h3>
          <Pill tone="violet">{t('sensors.badge.computed', 'COMPUTED')}</Pill>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 grid-entrance">
          {data.virtualSensors.map((vs, index) => (
            <Card key={index} hover={false} className="!p-0 overflow-hidden">
              <div className="h-1" style={{ background: vs.color }} />
              <div className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">{vs.name}</div>
                    <div className="text-[36px] font-bold tabular-nums tracking-tighter mt-2 leading-none">
                      {fmt(vs.value)}
                      <span className="text-lg align-baseline font-normal text-[var(--text-tertiary)] ml-1">{vs.unit}</span>
                    </div>
                  </div>
                  <Badge category={vs.category} />
                </div>

                <div className="mt-4 text-xs text-[var(--text-tertiary)] border-t border-[var(--border)] pt-3 font-mono">
                  {vs.formula}
                </div>

                {/* Confidence Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-[var(--emerald)]">{t('sensors.label.confidence', 'Confidence')}</span>
                    <span className="font-mono text-[var(--text-secondary)]">{vs.confidence}%</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden progress-bar">
                    <div
                      className="h-full bg-[var(--emerald)] rounded-full transition-all duration-700"
                      style={{ width: `${vs.confidence}%` }}
                    />
                  </div>
                </div>

                <div className="mt-2 flex justify-between text-[10px] text-[var(--text-disabled)]">
                  <span>{t('sensors.inputsUsedSuffix', '{count} inputs used', { count: vs.inputs.length })}</span>
                  {vs.missingInputs && vs.missingInputs.length > 0 && (
                    <span className="text-[var(--amber)]">{t('sensors.missingPrefix', 'Missing: ')}{vs.missingInputs.join(', ')}</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                  {(() => {
                    const who = WHO_GUIDELINES[vs.id as keyof typeof WHO_GUIDELINES] as { daily?: number } | undefined;
                    if (who?.daily && vs.value > who.daily) {
                      return <><AlertTriangle size={10} className="text-[var(--amber)]" /><span className="text-[var(--amber)]">{t('sensors.exceedsWho', 'Exceeds WHO {daily} {unit}', { daily: who.daily, unit: vs.unit })}</span></>;
                    }
                    if (who?.daily) {
                      return <><CheckCircle2 size={10} className="text-[var(--emerald)]" /><span className="text-[var(--emerald)]">{t('sensors.withinWho', 'Within WHO {daily} {unit}', { daily: who.daily, unit: vs.unit })}</span></>;
                    }
                    return null;
                  })()}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Estimated Sensors */}
      {estimated.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-4">
            <GaugeIcon size={16} className="text-[var(--cyan)]" />
            <h3 className="font-semibold">{t('sensors.estimatedSensors', 'Estimated Sensors')}</h3>
            <Pill tone="cyan">{estimated.length}</Pill>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 grid-entrance">
            {estimated.slice(0, 8).map((es) => (
              <Card key={es.id} hover={false} className="!p-0 overflow-hidden">
                <div className="h-1 bg-[var(--cyan)]" />
                <div className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-medium">{es.name}</div>
                      <div className="text-[36px] font-bold tabular-nums tracking-tighter leading-none mt-2 text-[var(--text-primary)]">
                        {es.value.toLocaleString()}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-1">{es.unit}</div>
                    </div>
                    <Badge category={es.category} />
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={es.confidence} label={t('sensors.label.confidence', 'Confidence')} accent={es.confidence >= 70 ? 'emerald' : es.confidence >= 50 ? 'amber' : 'rose'} />
                  </div>
                  <div className="mt-2 text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">
                    <Sigma size={10} className="opacity-60" />
                    <span className="line-clamp-1">{es.formula}</span>
                  </div>
                  <div className="mt-1 text-[9px] text-[var(--text-disabled)]">{t('sensors.tierReference', 'Tier {tier} · R² reference', { tier: es.tier })}</div>
                </div>
              </Card>
            ))}
            {estimated.length > 8 && (
              <Card className="flex items-center justify-center p-5" hover={false}>
                <div className="text-center">
                  <div className="text-lg font-bold text-[var(--text-tertiary)]">+{estimated.length - 8}</div>
                  <div className="text-xs text-[var(--text-disabled)] mt-1">{t('sensors.moreEstimates', 'more estimates')}</div>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
