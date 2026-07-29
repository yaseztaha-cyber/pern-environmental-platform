import { useState, useEffect } from 'react';
import { useData } from '../lib/data-provider';
import { useI18n } from '../lib/i18n';
import jsPDF from 'jspdf';
import { FileSpreadsheet, FileText, Download, Loader2, ArrowLeft, Check, BarChart3, Wind } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { PageHeader, Btn, Card, SectionTitle, Pill } from '../components/ui';

export default function ReportsPage() {
  const { data } = useData();
  const { t } = useI18n();
  const [generating, setGenerating] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [complianceStats, setComplianceStats] = useState<{ countries: number; frameworks: number; overallPct: number } | null>(null);
  const [complianceTrends, setComplianceTrends] = useState<Array<{ country: string; compliance: number; framework: string }>>([]);
  const [windData, setWindData] = useState<Array<{ speed: number; direction: number; time: string }>>([]);

  useEffect(() => {
    apiClient.get('/v3/compliance/stats').then((r: any) => {
      if (r) setComplianceStats({ countries: r.countries ?? 0, frameworks: r.frameworks ?? 0, overallPct: r.overallPct ?? r.averageCompliance ?? 0 });
    }).catch(() => {});
    apiClient.get('/v3/compliance/trends').then((r: any) => {
      if (Array.isArray(r)) setComplianceTrends(r);
    }).catch(() => {});
    apiClient.get('/v3/wind/forecast').then((r: any) => {
      if (Array.isArray(r)) setWindData(r.map((w: any) => ({ speed: w.speed, direction: w.direction, time: w.time || w.timestamp || '' })));
    }).catch(() => {});
  }, []);

  const generatePDF = async (type: string) => {
    setGenerating(type);
    try {
      const doc = new jsPDF();
      const date = new Date().toLocaleDateString();

      doc.setFontSize(22);
      doc.text('PERN Environmental Report', 20, 25);
      doc.setFontSize(12);
      doc.text(`Generated: ${date}  •  ${data.location}`, 20, 33);
      doc.text(`Report Type: ${type.toUpperCase()}`, 20, 40);

      doc.setFontSize(16);
      doc.text('Environmental Health Index', 20, 55);
      doc.setFontSize(32);
      doc.text(String(data.ehi), 20, 68);

      doc.setFontSize(14);
      doc.text('Virtual Sensors Summary', 20, 85);
      
      let y = 95;
      data.virtualSensors.slice(0, 8).forEach((vs, i) => {
        doc.setFontSize(11);
        doc.text(`${vs.name}: ${vs.value} ${vs.unit} (${vs.category})`, 25, y + (i * 7));
      });

      y += 8 * 7;
      doc.setFontSize(14);
      doc.text('Key Physical Readings', 20, y + 10);
      y += 20;
      Object.entries(data.physical).slice(0, 6).forEach(([key, val], i) => {
        doc.setFontSize(11);
        doc.text(`${key.toUpperCase()}: ${val}`, 25, y + (i * 7));
      });

      // Type-specific sections
      if ((type === 'compliance' || type === 'comprehensive') && complianceStats) {
        y += 50;
        doc.setFontSize(14);
        doc.text('Compliance Summary', 20, y);
        y += 8;
        doc.setFontSize(11);
        doc.text(`Countries monitored: ${complianceStats.countries}`, 25, y);
        y += 7;
        doc.text(`Frameworks tracked: ${complianceStats.frameworks}`, 25, y);
        y += 7;
        doc.text(`Average Compliance: ${complianceStats.overallPct}%`, 25, y);
        y += 10;
        if (complianceTrends.length > 0) {
          doc.setFontSize(12);
          doc.text('Compliance by Country:', 20, y);
          y += 7;
          complianceTrends.forEach((ct, i) => {
            doc.setFontSize(10);
            doc.text(`${ct.country}: ${ct.compliance}% (${ct.framework})`, 25, y + (i * 6));
          });
        }
      }

      if ((type === 'wind' || type === 'comprehensive') && windData.length > 0) {
        y += windData.length > 0 ? complianceTrends.length * 6 + 15 : 15;
        doc.setFontSize(14);
        doc.text('Wind Forecast', 20, y);
        y += 8;
        windData.slice(0, 6).forEach((w, i) => {
          doc.setFontSize(10);
          doc.text(`${w.time || `Period ${i+1}`}: ${w.speed.toFixed(1)} m/s, ${w.direction}° direction`, 25, y + (i * 6));
        });
      }

      doc.setFontSize(10);
      doc.text('STEM Gharbiya • PERN Platform v2.7 • 2026', 20, 280);

      doc.save(`PERN-${type}-Report-${date.replace(/\//g, '-')}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGenerating(null);
    }
  };

  const downloadCSV = (type: 'readings' | 'alerts') => {
    const url = type === 'readings'
      ? apiClient.exportReadingsCSV(500)
      : apiClient.exportAlertsCSV(200);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setExported(type);
    setTimeout(() => setExported(null), 2000);
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('reports.title') || 'Report Generation'}
        subtitle={`${data.virtualSensors.length} Virtual Sensors • 6 Report Types • CSV + PDF Export`}
        right={
          <div className="flex items-center gap-2">
            <Btn variant="ghost" size="sm" onClick={() => downloadCSV('readings')}>
              {exported === 'readings' ? <Check size={14} /> : <FileSpreadsheet size={14} />}
              <span className="hidden sm:inline">Sensors CSV</span>
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => downloadCSV('alerts')}>
              {exported === 'alerts' ? <Check size={14} /> : <FileText size={14} />}
              <span className="hidden sm:inline">Alerts CSV</span>
            </Btn>
          </div>
        }
      />

      {/* PDF Reports Grid */}
      <SectionTitle className="mb-4">PDF Reports</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        {[
          { type: 'daily', label: 'Daily Summary', desc: 'EHI + Key Metrics', bg: 'bg-[var(--emerald-dim)]', fg: 'text-[var(--emerald)]', icon: <FileText size={18} /> },
          { type: 'water', label: 'Water Quality', desc: 'WQI + Virtual Sensors', bg: 'bg-[var(--cyan-dim)]', fg: 'text-[var(--cyan)]', icon: <FileText size={18} /> },
          { type: 'air', label: 'Air Quality', desc: 'AQI + Pollutant Analysis', bg: 'bg-[var(--emerald-dim)]', fg: 'text-[var(--emerald)]', icon: <FileText size={18} /> },
          { type: 'compliance', label: 'Compliance', desc: `${complianceStats ? `${complianceStats.countries} countries, ${complianceStats.frameworks} frameworks` : 'WHO / EPA / Egypt'}`, bg: 'bg-[rgba(167,139,250,0.12)]', fg: 'text-[var(--violet)]', icon: <BarChart3 size={18} /> },
          { type: 'wind', label: 'Wind Forecast', desc: `${windData.length > 0 ? `${windData.length} forecast periods` : 'Speed / Direction'}`, bg: 'bg-[var(--amber-dim)]', fg: 'text-[var(--amber)]', icon: <Wind size={18} /> },
          { type: 'risk', label: 'Risk Assessment', desc: 'Environmental Risk Score', bg: 'bg-[var(--rose-dim)]', fg: 'text-[var(--rose)]', icon: <FileText size={18} /> },
          { type: 'vulnerable', label: 'Vulnerable Groups', desc: 'Sensitivity Analysis', bg: 'bg-[var(--amber-dim)]', fg: 'text-[var(--amber)]', icon: <FileText size={18} /> },
          { type: 'comprehensive', label: 'Comprehensive', desc: 'All metrics combined', bg: 'bg-[rgba(34,211,238,0.08)]', fg: 'text-[var(--cyan)]', icon: <FileText size={18} /> },
        ].map((report) => (
          <Card key={report.type} className="flex flex-col p-4 md:p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-[var(--radius-sm)] ${report.bg} flex items-center justify-center`}>
                <span className={report.fg}>{report.icon}</span>
              </div>
              <div>
                <div className="font-semibold text-[var(--text-primary)]">{report.label}</div>
                <div className="text-xs text-[var(--text-tertiary)]">{report.desc}</div>
              </div>
            </div>
            <Btn
              variant="primary"
              onClick={() => generatePDF(report.type)}
              disabled={generating !== null}
              className="mt-auto w-full"
            >
              {generating === report.type ? (
                <><Loader2 size={14} className="animate-spin" /> Generating...</>
              ) : (
                <><Download size={14} /> Download PDF</>
              )}
            </Btn>
          </Card>
        ))}
      </div>

      {/* CSV Quick Export Section */}
      <SectionTitle className="mb-4">CSV Data Export</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        <Card className="p-4 md:p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--emerald-dim)] flex items-center justify-center">
              <FileSpreadsheet size={18} className="text-[var(--emerald)]" />
            </div>
            <div>
              <div className="font-semibold text-[var(--text-primary)]">Sensor Readings</div>
              <div className="text-xs text-[var(--text-tertiary)]">All sensor data with timestamps (max 5000 rows)</div>
            </div>
          </div>
          <Btn variant="primary" onClick={() => downloadCSV('readings')} className="w-full">
            {exported === 'readings' ? <><Check size={14} /> Downloaded!</> : <><Download size={14} /> Download CSV</>}
          </Btn>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--rose-dim)] flex items-center justify-center">
              <FileText size={18} className="text-[var(--rose)]" />
            </div>
            <div>
              <div className="font-semibold text-[var(--text-primary)]">Alert History</div>
              <div className="text-xs text-[var(--text-tertiary)]">All triggered alerts with severity (max 2000 rows)</div>
            </div>
          </div>
          <Btn variant="primary" onClick={() => downloadCSV('alerts')} className="w-full">
            {exported === 'alerts' ? <><Check size={14} /> Downloaded!</> : <><Download size={14} /> Download CSV</>}
          </Btn>
        </Card>
      </div>
    </div>
  );
}
