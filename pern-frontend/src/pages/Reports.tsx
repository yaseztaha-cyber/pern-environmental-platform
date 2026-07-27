import { useState } from 'react';
import { useData } from '../lib/data-provider';
import { useI18n } from '../lib/i18n';
import jsPDF from 'jspdf';
import { FileSpreadsheet, FileText, Download, Loader2, ArrowLeft, Check } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { PageHeader, Btn, Card, SectionTitle } from '../components/ui';

export default function ReportsPage() {
  const { data } = useData();
  const { t } = useI18n();
  const [generating, setGenerating] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  const generatePDF = async (type: string) => {
    setGenerating(type);
    
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

    doc.setFontSize(14);
    doc.text('Key Physical Readings', 20, 165);
    y = 175;
    Object.entries(data.physical).slice(0, 6).forEach(([key, val], i) => {
      doc.setFontSize(11);
      doc.text(`${key.toUpperCase()}: ${val}`, 25, y + (i * 7));
    });

    doc.setFontSize(10);
    doc.text('STEM Gharbiya • PERN Platform v2.7 • 2026', 20, 280);

    doc.save(`PERN-${type}-Report-${date.replace(/\//g, '-')}.pdf`);
    setGenerating(null);
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-8">
        {[
          { type: 'daily', label: 'Daily Summary', desc: 'EHI + Key Metrics', bg: 'bg-[var(--emerald-dim)]', fg: 'text-[var(--emerald)]' },
          { type: 'water', label: 'Water Quality Report', desc: 'WQI + Virtual Sensors', bg: 'bg-[var(--cyan-dim)]', fg: 'text-[var(--cyan)]' },
          { type: 'air', label: 'Air Quality Report', desc: 'AQI + Pollutant Analysis', bg: 'bg-[var(--emerald-dim)]', fg: 'text-[var(--emerald)]' },
          { type: 'risk', label: 'Risk Assessment', desc: 'Environmental Risk Score', bg: 'bg-[var(--rose-dim)]', fg: 'text-[var(--rose)]' },
          { type: 'vulnerable', label: 'Vulnerable Groups', desc: 'Sensitivity Analysis', bg: 'bg-[var(--amber-dim)]', fg: 'text-[var(--amber)]' },
          { type: 'compliance', label: 'Compliance Report', desc: 'WHO / EPA / Egypt', bg: 'bg-[rgba(167,139,250,0.12)]', fg: 'text-[var(--violet)]' },
        ].map((report) => (
          <Card key={report.type} className="flex flex-col p-4 md:p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-[var(--radius-sm)] ${report.bg} flex items-center justify-center`}>
                <FileText size={18} className={report.fg} />
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
