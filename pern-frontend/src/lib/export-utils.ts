/**
 * PERN Export Utilities
 * Export sensor data to CSV and Excel (SpreadsheetML 2003 XML — no external deps)
 */

import { saveAs } from 'file-saver';

export interface ExportData {
  physical: Record<string, number>;
  virtualSensors: Array<{
    name: string;
    value: number;
    unit: string;
    category: string;
    confidence: number;
  }>;
  ehi: number;
  timestamp: number;
  location: string;
}

export function exportToCSV(data: ExportData, filename = 'pern-data') {
  const rows: any[] = [];

  Object.entries(data.physical).forEach(([key, value]) => {
    rows.push({
      Type: 'Physical',
      Parameter: key.toUpperCase(),
      Value: value,
      Unit: '',
      Category: '',
      Confidence: '',
      Timestamp: new Date(data.timestamp).toISOString()
    });
  });

  data.virtualSensors.forEach(vs => {
    rows.push({
      Type: 'Virtual',
      Parameter: vs.name,
      Value: vs.value,
      Unit: vs.unit,
      Category: vs.category,
      Confidence: `${vs.confidence}%`,
      Timestamp: new Date(data.timestamp).toISOString()
    });
  });

  rows.push({
    Type: 'Index',
    Parameter: 'EHI',
    Value: data.ehi,
    Unit: '',
    Category: '',
    Confidence: '',
    Timestamp: new Date(data.timestamp).toISOString()
  });

  const csvContent = [
    Object.keys(rows[0]).join(','),
    ...rows.map(row => Object.values(row).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${filename}-${new Date(data.timestamp).toISOString().slice(0, 10)}.csv`);
}

function escapeXml(value: any): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportToExcel(data: ExportData, filename = 'pern-data') {
  const rows: Array<Array<any>> = [
    ['Type', 'Parameter', 'Value', 'Unit', 'Category', 'Confidence']
  ];

  Object.entries(data.physical).forEach(([key, value]) => {
    rows.push(['Physical', key.toUpperCase(), value, '', '', '']);
  });

  data.virtualSensors.forEach(vs => {
    rows.push(['Virtual', vs.name, vs.value, vs.unit, vs.category, `${vs.confidence}%`]);
  });

  rows.push(['Index', 'EHI', data.ehi, '', '', '']);

  const body = rows.map(row =>
    '    <Row>\n' +
    row.map(cell => `      <Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('\n') +
    '\n    </Row>'
  ).join('\n');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="PERN Data">
    <Table>
${body}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  saveAs(blob, `${filename}-${new Date(data.timestamp).toISOString().slice(0, 10)}.xls`);
}

export interface TimeSeriesRow {
  [key: string]: string | number;
}

/**
 * Export a real time-series (e.g. EHI history, device readings) to CSV and
 * dependency-free SpreadsheetML .xls. Column order follows the first row's keys.
 */
export function exportTimeSeriesCSV(rows: TimeSeriesRow[], filename = 'pern-export') {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => csvCell(r[h])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${filename}-${stamp()}.csv`);
}

export function exportTimeSeriesExcel(rows: TimeSeriesRow[], filename = 'pern-export') {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const dataRows = rows.map(r => headers.map(h => r[h]));
  const allRows = [headers, ...dataRows];
  const body = allRows.map(row =>
    '    <Row>\n' +
    row.map(cell => {
      const type = typeof cell === 'number' ? 'Number' : 'String';
      return `      <Cell><Data ss:Type="${type}">${escapeXml(cell)}</Data></Cell>`;
    }).join('\n') +
    '\n    </Row>'
  ).join('\n');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="PERN Data">
    <Table>
${body}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  saveAs(blob, `${filename}-${stamp()}.xls`);
}

function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
