/**
 * ntfy Push Notifications Integration
 * Public service: https://ntfy.sh
 * 
 * Usage: sendNtfyNotification({ title, message, priority, tags })
 */

export interface NtfyNotification {
  title: string;
  message: string;
  priority?: 1 | 2 | 3 | 4 | 5; // 5 = max urgency
  tags?: string[];
  topic?: string;
}

const DEFAULT_TOPIC = 'pern-platform-alerts-2026';

export async function sendNtfyNotification(notification: NtfyNotification): Promise<boolean> {
  const topic = notification.topic || localStorage.getItem('pern_ntfy_topic') || DEFAULT_TOPIC;
  const url = `https://ntfy.sh/${topic}`;

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
  };

  if (notification.title) {
    headers['Title'] = notification.title;
  }
  if (notification.priority) {
    headers['Priority'] = notification.priority.toString();
  }
  if (notification.tags && notification.tags.length > 0) {
    headers['Tags'] = notification.tags.join(',');
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: notification.message,
    });

    if (response.ok) {
      if (import.meta.env.DEV) console.log('[ntfy] Notification sent successfully to', topic);
      return true;
    } else {
      if (import.meta.env.DEV) console.error('[ntfy] Failed to send:', response.status);
      return false;
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error('[ntfy] Network error:', error);
    return false;
  }
}

// Helper for common alert types
export const notifyCriticalAlert = (title: string, message: string) =>
  sendNtfyNotification({ title, message, priority: 5, tags: ['warning', 'critical'] });

export const notifyAutomationTrigger = (ruleName: string, value: number) =>
  sendNtfyNotification({
    title: `Automation: ${ruleName}`,
    message: `Rule triggered at value ${value}`,
    priority: 4,
    tags: ['automation', 'rule'],
  });

export const notifyDeviceStatus = (device: string, status: string) =>
  sendNtfyNotification({
    title: `Device ${device}`,
    message: `Status changed to ${status}`,
    priority: 3,
    tags: ['device'],
  });

// Test function (useful in Settings)
export async function testNtfyNotification(): Promise<boolean> {
  return sendNtfyNotification({
    title: '🔧 PERN Test Notification',
    message: 'This is a test from the PERN platform. ntfy integration is working correctly.',
    priority: 3,
    tags: ['test', 'pern'],
  });
}