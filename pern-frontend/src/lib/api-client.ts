/**
 * PERN API Client with Authentication
 * Supports both Organization and Individual users
 */

import { getCurrentContext } from './app-context';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

class APIClient {
  private getAuthHeaders(): HeadersInit {
    const context = getCurrentContext();
    const token = sessionStorage.getItem('pern_auth_token');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (context.type === 'organization') {
      headers['X-Organization-Id'] = context.id;
    } else {
      headers['X-User-Id'] = context.id;
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const headers = this.getAuthHeaders();
    const maxRetries = 2;
    const timeoutMs = 30000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...headers,
            ...options.headers,
          },
        });

        clearTimeout(timer);

        if (response.status === 401) {
          sessionStorage.removeItem('pern_auth_token');
          if (window.location.hash !== '#/login' && !endpoint.includes('/health')) {
            window.location.hash = '#/login';
          }
          throw new Error(`API Error: 401 Unauthorized`);
        }

        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
      } catch (err: any) {
        clearTimeout(timer);
        if (err?.name === 'AbortError') {
          if (attempt < maxRetries) continue;
          throw new Error(`API Error: Request timed out after ${timeoutMs}ms`);
        }
        // Don't retry on auth errors or client errors (4xx)
        if (err?.message?.includes('401') || err?.message?.includes('API Error: 4')) {
          throw err;
        }
        if (attempt < maxRetries) continue;
        throw err;
      }
    }
    throw new Error('API Error: Max retries exceeded');
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, body: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T>(endpoint: string, body: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  // ===================== Devices =====================
  getDevices() { return this.get<any[]>('/devices'); }
  getDevice(id: string) { return this.get<any>(`/devices/${id}`); }
  saveDevice(device: any) { return this.post<any>('/devices', device); }
  updateDevice(id: string, device: any) { return this.put<any>(`/devices/${id}`, device); }
  deleteDevice(id: string) { return this.delete<any>(`/devices/${id}`); }
  getDeviceLocations() { return this.get<any[]>('/devices/locations/all'); }
  saveDeviceLocation(id: string, lat: number, lng: number) {
    return this.put<any>(`/devices/${id}/location`, { lat, lng });
  }
  getDeviceReadings(id: string, limit = 50) { return this.get<any[]>(`/devices/${id}/readings?limit=${limit}`); }
  getDeviceLatestReading(id: string) { return this.get<any>(`/devices/${id}/readings?limit=1`); }
  getDeviceHealth(id: string) { return this.get<any>(`/devices/${id}/health`); }
  getDeviceHealthHistory(id: string, limit = 50) { return this.get<any[]>(`/devices/${id}/health/history?limit=${limit}`); }
  sendActuatorCommand(id: string, actuator: string, action: string) {
    return this.post<any>(`/devices/${id}/actuator`, { actuator, action });
  }

  // ===================== Sensors =====================
  getSensorReadings(limit = 100, device?: string) {
    const q = device ? `?device=${device}&limit=${limit}` : `?limit=${limit}`;
    return this.get<any[]>(`/sensors${q}`);
  }

  // ===================== Alerts =====================
  getAlerts(device?: string) { return this.get<any[]>(`/alerts${device ? `?device=${device}` : ''}`); }
  createAlert(alert: any) { return this.post<any>('/alerts', alert); }
  acknowledgeAlert(id: string) { return this.post<any>(`/alerts/${id}/acknowledge`, {}); }

  // ===================== Alert History =====================
  getAlertHistory(params?: { limit?: number; severity?: string; device?: string }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.severity) q.set('severity', params.severity);
    if (params?.device) q.set('device', params.device);
    return this.get<any[]>(`/alerts/history?${q.toString()}`);
  }
  acknowledgeAlertHistory(id: string | number) {
    return this.post<any>(`/alerts/history/${id}/acknowledge`, {});
  }
  getAlertStats() { return this.get<any>('/alerts/stats'); }

  // ===================== Alert Rules =====================
  getAlertRules() { return this.get<any[]>('/alerts/rules'); }
  createAlertRule(rule: any) { return this.post<any>('/alerts/rules', rule); }
  deleteAlertRule(id: string) { return this.delete<any>(`/alerts/rules/${id}`); }

  // ===================== Thresholds =====================
  getThresholds() { return this.get<any[]>('/thresholds'); }
  saveThreshold(threshold: any) { return this.post<any>('/thresholds', threshold); }

  // ===================== Automation =====================
  getAutomationRules() { return this.get<any[]>('/automation/rules'); }
  createAutomationRule(rule: any) { return this.post<any>('/automation/rules', rule); }
  deleteAutomationRule(id: string) { return this.delete<any>(`/automation/rules/${id}`); }
  getAutomationLogs() { return this.get<any[]>('/automation/logs'); }
  reloadAutomationRules() { return this.post<any>('/automation/reload-rules', {}); }

  // ===================== Reports =====================
  generateReport(type: string, device?: string) {
    return this.post<any>('/reports/generate', { type, device });
  }
  getAvailableReports() { return this.get<any[]>('/reports/available'); }

  // ===================== Export =====================
  exportReadingsCSV(limit = 500, device?: string) {
    const q = new URLSearchParams({ limit: String(limit) });
    if (device) q.set('device', device);
    return `${API_BASE}/export/readings/csv?${q.toString()}`;
  }
  exportAlertsCSV(limit = 200) {
    return `${API_BASE}/export/alerts/csv?limit=${limit}`;
  }

  // ===================== EHI History =====================
  postEHIHistory(data: { deviceId?: string; ehi: number; category?: string }) {
    return this.post<any>('/ehi-history', data);
  }
  getEHIHistory(device?: string, from?: string) {
    const q = new URLSearchParams();
    if (device) q.set('device', device);
    if (from) q.set('from', from);
    const qs = q.toString();
    return this.get<any[]>(`/ehi-history${qs ? `?${qs}` : ''}`);
  }

  // ===================== Audit Logs =====================
  getAuditLogs(params?: { limit?: number; userId?: string; resourceType?: string }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.userId) q.set('userId', params.userId);
    if (params?.resourceType) q.set('resourceType', params.resourceType);
    return this.get<any[]>(`/audit-logs?${q.toString()}`);
  }

  // ===================== Calibration =====================
  getDeviceCalibration(deviceId: string) { return this.get<any>(`/devices/${deviceId}/metadata`); }
  saveDeviceCalibration(deviceId: string, cal: any) { return this.post<any>(`/devices/${deviceId}/metadata`, cal); }

  // ===================== Firmware =====================
  getFirmwareVersions(deviceType?: string) { return this.get<any[]>(`/firmware${deviceType ? `?deviceType=${deviceType}` : ''}`); }
  getLatestFirmware(deviceType: string) { return this.get<any>(`/firmware/latest/${deviceType}`); }
  createFirmwareVersion(fw: any) { return this.post<any>('/firmware', fw); }
  deleteFirmwareVersion(id: string | number) { return this.delete<any>(`/firmware/${id}`); }
  updateDeviceFirmware(deviceId: string, deviceType: string) { return this.post<any>(`/firmware/${deviceId}/update`, { deviceType }); }

  // ===================== Users / Orgs =====================
  getUsers(orgId?: string) { return this.get<any[]>(`/users${orgId ? `?orgId=${orgId}` : ''}`); }
  getOrganizations() { return this.get<any[]>('/organizations'); }

  // ===================== AI Tools =====================
  generateRule(prompt: string) { return this.post<any>('/ai-tools/generate-rule', { text: prompt }); }
  rootCauseAnalysis(data: any) { return this.post<any>('/ai-tools/root-cause', data); }

  // ===================== Chatbot =====================
  chat(message: string, context?: any, sessionId?: string) {
    return this.post<any>('/chatbot/chat', { message, context, sessionId });
  }

  // ===================== AI Tools (Enhanced) =====================
  explainAnomaly(data: any) { return this.post<any>('/ai-tools/explain-anomaly', data); }
  analyzeTrend(data: any) { return this.post<any>('/ai-tools/analyze-trend', data); }
  predictMaintenance(data: any) { return this.post<any>('/ai-tools/predict-maintenance', data); }
  diagnoseSensors(data: any) { return this.post<any>('/ai-tools/diagnose-sensors', data); }
  getAIStats() { return this.get<any>('/ai-tools/stats'); }

  // ===================== Chatbot (Enhanced) =====================
  getConversations() { return this.get<any[]>('/chatbot/conversations'); }
  getConversationMessages(id: string) { return this.get<any[]>(`/chatbot/conversations/${id}/messages`); }
  deleteConversation(id: string) { return this.delete<any>(`/chatbot/conversations/${id}`); }
  updateConversationTitle(id: string, title: string) { return this.post<any>(`/chatbot/conversations/${id}/title`, { title }); }

  // ===================== Seed =====================
  seedDemoData() { return this.post<any>('/seed/demo', {}); }

  // ===================== Health =====================
  getHealth() { return this.get<any>('/health'); }
  getLiveStatus() { return this.get<any>('/live/status'); }
}

export const apiClient = new APIClient();
