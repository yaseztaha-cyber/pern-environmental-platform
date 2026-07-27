/**
 * OpenAQ Integration Service
 * 
 * Fetches real-world air quality data via backend proxy (avoids CORS).
 */

import { API_BASE } from './constants';

export interface OpenAQResponse {
  location: string;
  pm25: number | null;
  no2: number | null;
  o3: number | null;
  timestamp: string | null;
}

/**
 * Fetch latest air quality data for a city via backend proxy
 */
export async function fetchOpenAQData(city: string = 'Cairo'): Promise<OpenAQResponse | null> {
  try {
    const response = await fetch(`${API_BASE}/openaq?city=${encodeURIComponent(city)}`);
    if (!response.ok) throw new Error(`OpenAQ proxy error: ${response.status}`);
    const data = await response.json();
    if (data.error) return null;
    return data;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Failed to fetch OpenAQ data:', error);
    return null;
  }
}

/**
 * Get available cities with data
 */
export async function getAvailableCities(): Promise<string[]> {
  return [
    'Cairo', 'Alexandria', 'Giza',
    'London', 'Paris', 'Berlin',
    'New York', 'Los Angeles', 'Chicago',
    'Beijing', 'Shanghai', 'Delhi',
    'Tokyo', 'Seoul', 'Singapore'
  ];
}
