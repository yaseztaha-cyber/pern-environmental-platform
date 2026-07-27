import { useState } from 'react';
import { useData } from '../lib/data-provider';
import { fetchOpenAQData } from '../lib/openaq-service';
import { getAverageReading } from '../lib/sensor-community-service';
import { PageHeader, Card, EmptyState } from '../components/ui';
import { showToast } from '../components/Toast';
import { GitCompareArrows } from 'lucide-react';

export default function CompareVirtualSensors() {
  const { data, hasRealData } = useData();
  const [city, setCity] = useState('Cairo');
  const [countryCode, setCountryCode] = useState('EG');
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runComparison = async () => {
    setLoading(true);
    try {
      const [openaq, sensorCommunity] = await Promise.all([
        fetchOpenAQData(city),
        getAverageReading(countryCode)
      ]);

      const virtualAQI = data.virtualSensors.find(vs => vs.name.includes('Air Quality'));
      const virtualWQI = data.virtualSensors.find(vs => vs.name.includes('Water Quality'));

      setComparison({
        city,
        timestamp: new Date().toISOString(),
        pern: {
          ehi: data.ehi,
          aqi: virtualAQI?.value || null,
          wqi: virtualWQI?.value || null,
          pm25: data.physical.pm25
        },
        openaq: openaq,
        sensorCommunity: sensorCommunity
      });
    } catch (error) {
      console.error('Comparison failed:', error);
      showToast('Failed to fetch comparison data. Check your network and try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Compare Virtual Sensors"
        subtitle="PERN virtual sensors vs Real-world data"
      />

      <Card className="mb-6" hover={false}>
        <div className="flex gap-4">
          <input 
            type="text" 
            value={city} 
            onChange={e => setCity(e.target.value)}
            className="flex-1 bg-[var(--surface)] px-4 py-3 rounded-[var(--radius-sm)]"
            placeholder="City name (OpenAQ)"
          />
          <input 
            type="text" 
            value={countryCode} 
            onChange={e => setCountryCode(e.target.value.toUpperCase())}
            className="w-24 bg-[var(--surface)] px-4 py-3 rounded-[var(--radius-sm)]"
            placeholder="Country"
            maxLength={2}
          />
          <button 
            onClick={runComparison} 
            disabled={loading || !hasRealData}
            className="px-8 py-3 bg-[var(--emerald)] hover:opacity-90 disabled:opacity-50 rounded-[var(--radius-sm)]"
          >
            {loading ? 'Comparing...' : 'Compare'}
          </button>
        </div>
      </Card>

      {!hasRealData && (
        <EmptyState
          icon={<GitCompareArrows size={22} />}
          title="No live sensor data"
          message="Connect a device and enter Live Mode to compare virtual sensor values with real-world data."
        />
      )}

      {comparison && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* PERN Data */}
          <Card hover={false}>
            <h3 className="font-semibold mb-4">PERN Virtual Sensors</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>EHI</span>
                <span className="font-mono">{comparison.pern.ehi}</span>
              </div>
              <div className="flex justify-between">
                <span>Air Quality Index <span className="text-[10px] text-[var(--text-disabled)]">(composite 0-500)</span></span>
                <span className="font-mono">{comparison.pern.aqi || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Water Quality Index <span className="text-[10px] text-[var(--text-disabled)]">(penalty 0-100)</span></span>
                <span className="font-mono">{comparison.pern.wqi || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>PM2.5</span>
                <span className="font-mono">{comparison.pern.pm25 ? `${comparison.pern.pm25} µg/m³` : 'N/A'}</span>
              </div>
            </div>
          </Card>

          {/* Real Data */}
          <Card hover={false}>
            <h3 className="font-semibold mb-4">Real-World Data</h3>
            <div className="space-y-3 text-sm">
              {comparison.openaq && (
                <div>
                  <div className="font-medium mb-2">OpenAQ</div>
                  <div className="flex justify-between">
                    <span>PM2.5</span>
                    <span className="font-mono">{comparison.openaq.pm25} <span className="text-[var(--text-disabled)]">µg/m³</span></span>
                  </div>
                </div>
              )}
              {comparison.sensorCommunity && (
                <div>
                  <div className="font-medium mb-2">Sensor.Community</div>
                  <div className="flex justify-between">
                    <span>Avg PM2.5</span>
                    <span className="font-mono">{comparison.sensorCommunity.avgPM25} <span className="text-[var(--text-disabled)]">µg/m³</span></span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}