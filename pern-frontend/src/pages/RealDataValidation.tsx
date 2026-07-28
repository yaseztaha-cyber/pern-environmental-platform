import { useState } from 'react';
import { useData } from '../lib/data-provider';
import { generateValidationReport } from '../lib/validation-service';
import { PageHeader, Card, Btn, SectionTitle, EmptyState } from '../components/ui';
import { showToast } from '../components/Toast';
import { ShieldCheck } from 'lucide-react';

export default function RealDataValidation() {
  const { data, hasRealData } = useData();
  const [city, setCity] = useState('Cairo');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runValidation = async () => {
    setLoading(true);
    try {
      const report = await generateValidationReport({
        pm25: data.physical.pm25 ?? 0,
        city: city
      });
      setResults(report);
    } catch (error) {
      console.error('Validation failed:', error);
      showToast('Validation failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Real Data Validation"
        subtitle="Compare PERN predictions with real-world OpenAQ data"
      />

      {!hasRealData && (
        <EmptyState
          icon={<ShieldCheck size={22} />}
          title="No live sensor data"
          message="Connect a device and enter Live Mode to validate virtual sensor accuracy against real-world OpenAQ data."
        />
      )}

      <Card className="mb-6" hover={false}>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-tertiary)]">City</label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              className="w-full mt-1 bg-[var(--surface)] px-4 py-3 rounded-[var(--radius-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--emerald)]"
              placeholder="Cairo"
            />
          </div>
          <Btn variant="primary" onClick={runValidation} disabled={loading || !hasRealData} loading={loading}>
            {loading ? 'Validating...' : 'Compare with Real Data'}
          </Btn>
        </div>
      </Card>

      {results && (
        <Card hover={false}>
          <SectionTitle>Validation Results</SectionTitle>

          {results.success ? (
            <>
              <div className="mb-6">
                <div className="text-sm text-[var(--text-tertiary)]">Average Accuracy</div>
                <div className="text-5xl font-semibold text-[var(--emerald)] tracking-tighter">
                  {results.averageAccuracy}%
                </div>
              </div>

              <div className="space-y-4 grid-entrance">
                {results.results.map((r: any, i: number) => (
                  <div key={i} className="p-4 bg-[var(--surface)] rounded-[var(--radius-sm)] border border-[var(--border)]">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">{r.parameter}</div>
                        <div className="text-sm text-[var(--text-tertiary)]">Difference: {r.difference}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-2xl text-[var(--text-primary)]">{r.accuracy}%</div>
                        <div className="text-xs text-[var(--text-tertiary)]">Accuracy</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-[var(--amber)]">{results.message}</div>
          )}
        </Card>
      )}
    </div>
  );
}
