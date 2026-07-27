/**
 * OpenAQ Historical Data Service
 * 
 * Allows downloading historical air quality data for model validation
 * and long-term analysis.
 */

const OPENAQ_BASE_URL = 'https://api.openaq.org/v2';

/**
 * Download historical measurements for a city
 */
export async function downloadHistoricalData(
  city: string,
  parameter: string = 'pm25',
  limit: number = 100
): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      city: city,
      parameter: parameter,
      limit: limit.toString(),
      sort: 'desc',
      order_by: 'datetime'
    });

    const response = await fetch(`${OPENAQ_BASE_URL}/measurements?${params}`);

    if (!response.ok) {
      throw new Error(`OpenAQ API error: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];

  } catch (error) {
    if (import.meta.env.DEV) console.error('Failed to download historical data:', error);
    return [];
  }
}

/**
 * Convert OpenAQ historical data to PERN EHI format
 */
export function convertToEHIFormat(openaqData: any[]): number[] {
  // Extract PM2.5 values and convert to approximate EHI
  return openaqData
    .filter(item => item.parameter === 'pm25' && item.value)
    .map(item => {
      // Rough conversion from PM2.5 to EHI (higher PM2.5 = lower EHI)
      const pm25 = parseFloat(item.value);
      return Math.max(30, Math.min(90, 90 - (pm25 * 1.2)));
    })
    .slice(0, 30); // Limit to 30 data points
}

/**
 * Get historical data ready for prediction validation
 */
export async function getHistoricalEHI(city: string): Promise<number[]> {
  const data = await downloadHistoricalData(city, 'pm25', 50);
  return convertToEHIFormat(data);
}