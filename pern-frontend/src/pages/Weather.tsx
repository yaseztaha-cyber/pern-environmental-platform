import { useState, useEffect } from 'react';
import { useData } from '../lib/data-provider';
import { PageHeader, Card, Pill, Btn, SectionTitle, LoadingState, EmptyState, fmt } from '../components/ui';
import { Droplets, Wind, CloudRain, Sun, MapPin } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface WeatherData {
  current: {
    temperature: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
    weatherCode: number;
    apparentTemperature: number;
    precipitation: number;
  };
  hourly: {
    time: string[];
    temperature: number[];
    humidity: number[];
    precipitationProbability: number[];
    windSpeed: number[];
  };
  location: { name: string; lat: number; lon: number };
}

const WMO_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: 'Clear sky', icon: '☀️' },
  1: { label: 'Mainly clear', icon: '🌤' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫' },
  48: { label: 'Rime fog', icon: '🌫' },
  51: { label: 'Light drizzle', icon: '🌦' },
  53: { label: 'Moderate drizzle', icon: '🌦' },
  55: { label: 'Dense drizzle', icon: '🌧' },
  61: { label: 'Slight rain', icon: '🌧' },
  63: { label: 'Moderate rain', icon: '🌧' },
  65: { label: 'Heavy rain', icon: '🌧' },
  80: { label: 'Slight showers', icon: '🌦' },
  81: { label: 'Moderate showers', icon: '🌧' },
  82: { label: 'Violent showers', icon: '⛈' },
  95: { label: 'Thunderstorm', icon: '⛈' },
  96: { label: 'Thunderstorm with hail', icon: '⛈' },
  99: { label: 'Thunderstorm with heavy hail', icon: '⛈' },
};

function getWindDir(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// Egyptian cities with coordinates
const CITIES = [
  { name: 'Cairo', lat: 30.0444, lon: 31.2357 },
  { name: 'Giza', lat: 30.0131, lon: 31.2089 },
  { name: 'Alexandria', lat: 31.2001, lon: 29.9187 },
  { name: 'Luxor', lat: 25.6872, lon: 32.6396 },
  { name: 'Aswan', lat: 24.0889, lon: 32.8998 },
  { name: 'Port Said', lat: 31.2653, lon: 32.3019 },
  { name: 'Ismailia', lat: 30.5965, lon: 32.2715 },
  { name: 'Mansoura', lat: 31.0409, lon: 31.3785 },
];

export default function WeatherPage() {
  const { data } = useData();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState(CITIES[0]);

  const fetchWeather = async (c: typeof CITIES[0]) => {
    setLoading(true);
    setError(null);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m&timezone=Africa/Cairo&forecast_days=2`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather API unavailable');
      const json = await res.json();

      const hourlyCount = 24;
      const hourly = {
        time: json.hourly.time.slice(0, hourlyCount).map((t: string) => {
          const d = new Date(t);
          return `${d.getHours().toString().padStart(2, '0')}:00`;
        }),
        temperature: json.hourly.temperature_2m.slice(0, hourlyCount),
        humidity: json.hourly.relative_humidity_2m.slice(0, hourlyCount),
        precipitationProbability: json.hourly.precipitation_probability.slice(0, hourlyCount),
        windSpeed: json.hourly.wind_speed_10m.slice(0, hourlyCount),
      };

      setWeather({
        current: {
          temperature: json.current.temperature_2m,
          humidity: json.current.relative_humidity_2m,
          windSpeed: json.current.wind_speed_10m,
          windDirection: json.current.wind_direction_10m,
          weatherCode: json.current.weather_code,
          apparentTemperature: json.current.apparent_temperature,
          precipitation: json.current.precipitation,
        },
        hourly,
        location: { name: c.name, lat: c.lat, lon: c.lon },
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch weather data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWeather(city); }, [city]);

  const wmo = weather ? WMO_CODES[weather.current.weatherCode] || { label: 'Unknown', icon: '❓' } : null;

  // Correlation with sensor data
  const sensorHumidity = data.physical.hum;
  const weatherHumidity = weather?.current.humidity;
  const humidityDelta = sensorHumidity != null && weatherHumidity != null
    ? Math.round(sensorHumidity - weatherHumidity)
    : null;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Weather Integration"
        subtitle="Real-time conditions from Open-Meteo • Correlated with your sensors"
        right={
          <Btn variant="ghost" size="sm" className="gap-2">
            <MapPin size={14} className="text-[var(--text-disabled)]" />
            <select
              value={city.name}
              onChange={e => setCity(CITIES.find(c => c.name === e.target.value) || CITIES[0])}
              className="bg-transparent text-xs cursor-pointer outline-none"
            >
              {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </Btn>
        }
      />

      {loading ? (
        <LoadingState label="Fetching weather data…" />
      ) : error ? (
        <EmptyState title="Weather unavailable" message={error} />
      ) : weather ? (
        <>
          {/* Current conditions hero */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 grid-entrance">
            {/* Main temp */}
            <div className="md:col-span-1 panel-glow p-6 flex flex-col justify-between">
              <div>
                <div className="text-5xl font-bold tracking-tighter">{fmt(weather.current.temperature)}°</div>
                <div className="text-sm text-[var(--text-secondary)] mt-1">{wmo?.icon} {wmo?.label}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">Feels like {fmt(weather.current.apparentTemperature)}°C</div>
              </div>
              <div className="text-xs text-[var(--text-disabled)] mt-4">{weather.location.name}, Egypt</div>
            </div>

            {/* Details */}
            <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Droplets, label: 'Humidity', value: `${fmt(weather.current.humidity)}%`, color: 'text-[var(--cyan)]' },
                { icon: Wind, label: 'Wind', value: `${fmt(weather.current.windSpeed)} km/h`, color: 'text-[var(--cyan)]', sub: getWindDir(weather.current.windDirection) },
                { icon: CloudRain, label: 'Precipitation', value: `${fmt(weather.current.precipitation)} mm`, color: 'text-[var(--indigo)]' },
                { icon: Sun, label: 'UV Index', value: '—', color: 'text-[var(--amber)]' },
              ].map(({ icon: Icon, label, value, color, sub }) => (
                <div key={label} className="glass rounded-[var(--radius-md)] p-4">
                  <Icon size={16} className={color} />
                  <div className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mt-2">{label}</div>
                  <div className="text-xl font-bold mt-0.5">{value}</div>
                  {sub && <div className="text-xs text-[var(--text-tertiary)]">{sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Sensor correlation */}
          {humidityDelta !== null && (
            <Card className="mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[var(--radius-xs)] bg-[var(--cyan-dim)] flex items-center justify-center">
                  <Droplets size={14} className="text-[var(--cyan)]" />
                </div>
                <div>
                  <div className="text-sm font-medium">Indoor vs Outdoor Humidity</div>
                  <div className="text-xs text-[var(--text-tertiary)]">
                    Your sensor reads <span className="text-[var(--emerald)] font-mono">{fmt(sensorHumidity)}%</span> vs outdoor <span className="font-mono">{fmt(weatherHumidity)}%</span>
                    {Math.abs(humidityDelta) > 10
                      ? <> — <span className="text-[var(--amber)]">significant difference ({humidityDelta > 0 ? '+' : ''}{humidityDelta}%)</span></>
                      : ' — consistent'}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Hourly forecast chart */}
          <Card className="mb-6">
            <SectionTitle>24-Hour Forecast</SectionTitle>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weather.hourly.time.map((t, i) => ({
                  time: t,
                  temp: weather.hourly.temperature[i],
                  humidity: weather.hourly.humidity[i],
                  precip: weather.hourly.precipitationProbability[i],
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="time" stroke="var(--text-disabled)" fontSize={10} interval={3} />
                  <YAxis yAxisId="temp" stroke="var(--text-disabled)" fontSize={10} domain={['auto', 'auto']} />
                  <YAxis yAxisId="humidity" orientation="right" stroke="var(--text-disabled)" fontSize={10} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                    }}
                  />
                  <Line yAxisId="temp" type="monotone" dataKey="temp" stroke="var(--emerald)" strokeWidth={2} dot={false} name="Temp (°C)" />
                  <Line yAxisId="humidity" type="monotone" dataKey="humidity" stroke="var(--cyan)" strokeWidth={2} dot={false} name="Humidity (%)" />
                  <Line yAxisId="humidity" type="monotone" dataKey="precip" stroke="var(--indigo)" strokeWidth={1.5} dot={false} strokeDasharray="4 4" name="Rain prob (%)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Environmental insight */}
          <Card>
            <SectionTitle>Environmental Correlation</SectionTitle>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {weather.current.temperature > 35
                ? 'High outdoor temperature detected. Elevated PM2.5 and ozone levels are common in these conditions. Monitor air quality closely.'
                : weather.current.humidity > 80
                  ? 'High humidity may affect water quality sensors. pH and dissolved oxygen readings can be influenced by atmospheric moisture.'
                  : weather.current.windSpeed > 30
                    ? 'Strong winds can disperse airborne pollutants but may also carry dust and particulate matter from surrounding areas.'
                    : 'Current weather conditions are moderate. No significant environmental impact expected from weather patterns.'}
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
