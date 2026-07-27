/**
 * Sensor.Community Integration
 * 
 * Fetches real-time air quality data from the open citizen-science network.
 * https://sensor.community
 */

export interface SensorCommunityReading {
  location: string;
  pm25: number | null;
  pm10: number | null;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  timestamp: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Fetch latest data from Sensor.Community
 * Note: Their API is public and doesn't require authentication
 */
export async function fetchSensorCommunityData(
  country: string = 'EG'
): Promise<SensorCommunityReading[]> {
  try {
    // Sensor.Community public API
    const response = await fetch(
      `https://data.sensor.community/airrohr/v1/filter/country=${country}`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Sensor.Community API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform the data into a cleaner format
    const readings: SensorCommunityReading[] = data.slice(0, 20).map((item: any) => {
      const sensors = item.sensordatavalues || [];
      
      const pm25 = sensors.find((s: any) => s.value_type === 'P2')?.value;
      const pm10 = sensors.find((s: any) => s.value_type === 'P1')?.value;
      const temperature = sensors.find((s: any) => s.value_type === 'temperature')?.value;
      const humidity = sensors.find((s: any) => s.value_type === 'humidity')?.value;
      const pressure = sensors.find((s: any) => s.value_type === 'pressure')?.value;

      return {
        location: item.location?.city || 'Unknown',
        pm25: pm25 ? parseFloat(pm25) : null,
        pm10: pm10 ? parseFloat(pm10) : null,
        temperature: temperature ? parseFloat(temperature) : null,
        humidity: humidity ? parseFloat(humidity) : null,
        pressure: pressure ? parseFloat(pressure) : null,
        timestamp: item.timestamp,
        latitude: item.location?.latitude,
        longitude: item.location?.longitude
      };
    });

    return readings;

  } catch (error) {
    if (import.meta.env.DEV) console.error('Failed to fetch Sensor.Community data:', error);
    return [];
  }
}

/**
 * Get a single average reading for a country
 */
export async function getAverageReading(country: string = 'EG') {
  const readings = await fetchSensorCommunityData(country);
  
  if (readings.length === 0) return null;

  const validPM25 = readings.filter(r => r.pm25 !== null).map(r => r.pm25!);
  const validPM10 = readings.filter(r => r.pm10 !== null).map(r => r.pm10!);

  return {
    country,
    avgPM25: validPM25.length > 0 
      ? Math.round(validPM25.reduce((a, b) => a + b, 0) / validPM25.length) 
      : null,
    avgPM10: validPM10.length > 0 
      ? Math.round(validPM10.reduce((a, b) => a + b, 0) / validPM10.length) 
      : null,
    sensorCount: readings.length,
    timestamp: new Date().toISOString()
  };
}