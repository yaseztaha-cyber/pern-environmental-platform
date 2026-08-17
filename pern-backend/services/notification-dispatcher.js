/**
 * Notification Dispatcher — sends alerts via ntfy, email (SMTP/nodemailer),
 * Slack webhooks, SMS (Twilio REST), and in-app WebSocket.
 *
 * Every channel is non-fatal: a failure in one channel never blocks the
 * others. Each send returns { channel, sent, reason? }.
 */

const logger = require('../utils/logger');
const nodemailer = require('nodemailer');

let wsBroadcastFn = null;
let getClientCountFn = null;

const dispatchLog = [];
const MAX_LOG = 500;

const SEVERITY_PRIORITY = { critical: 5, high: 4, warning: 4, medium: 3, info: 2, low: 2 };

function severityPriority(severity, fallback) {
  return SEVERITY_PRIORITY[severity] || fallback || 4;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(fn, attempts = 2) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastError;
}

function sendInApp(title, message, severity) {
  if (wsBroadcastFn) {
    wsBroadcastFn(title, message, severity);
    return { channel: 'in-app', sent: true };
  }
  return { channel: 'in-app', sent: false, reason: 'no-broadcaster' };
}

async function sendNtfy(title, message, severity, extra = {}) {
  const baseUrl = (process.env.NTFY_BASE_URL || 'https://ntfy.sh').replace(/\/+$/, '');
  const topic = process.env.NTFY_TOPIC || 'pern-platform-alerts-2026';
  if (!topic) return { channel: 'ntfy', sent: false, reason: 'not-configured' };
  const url = `${baseUrl}/${encodeURIComponent(topic)}`;
  try {
    await withRetry(() => fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Title: title,
        Priority: severityPriority(severity, extra.priority).toString(),
        Tags: (extra.tags || ['warning']).join(','),
      },
      body: message,
    }));
    return { channel: 'ntfy', sent: true };
  } catch (err) {
    logger.error('[NotificationDispatcher] ntfy failed', { error: err.message });
    return { channel: 'ntfy', sent: false, reason: err.message };
  }
}

async function sendEmail(title, message, severity, extra = {}) {
  const host = process.env.SMTP_HOST;
  if (!host) return { channel: 'email', sent: false, reason: 'not-configured' };
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });
    const to = extra.to || process.env.SMTP_TO || 'ops@pern.local';
    await withRetry(() => transporter.sendMail({
      from: process.env.SMTP_FROM || (process.env.SMTP_USER || 'pern@pern.local'),
      to,
      subject: `[${(severity || 'info').toUpperCase()}] ${title}`,
      text: message,
    }));
    return { channel: 'email', sent: true };
  } catch (err) {
    logger.error('[NotificationDispatcher] email failed', { error: err.message });
    return { channel: 'email', sent: false, reason: err.message };
  }
}

async function sendSlack(title, message, severity, extra = {}) {
  const webhookUrl = extra.webhookUrl || process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { channel: 'slack', sent: false, reason: 'not-configured' };
  try {
    await withRetry(() => fetchWithTimeout(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*${title}*\n${message}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: title } },
          { type: 'section', text: { type: 'mrkdwn', text: message } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `severity: ${severity}` }] },
        ],
      }),
    }));
    return { channel: 'slack', sent: true };
  } catch (err) {
    logger.error('[NotificationDispatcher] slack failed', { error: err.message });
    return { channel: 'slack', sent: false, reason: err.message };
  }
}

async function sendSms(title, message, severity, extra = {}) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = extra.to || process.env.TWILIO_TO;
  if (!sid || !token || !from || !to) {
    return { channel: 'sms', sent: false, reason: 'not-configured' };
  }
  try {
    const body = new URLSearchParams({
      To: to,
      From: from,
      Body: `[PERN] ${title}\n${message}`,
    });
    await withRetry(() => fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        },
        body,
      }
    ));
    return { channel: 'sms', sent: true };
  } catch (err) {
    logger.error('[NotificationDispatcher] sms failed', { error: err.message });
    return { channel: 'sms', sent: false, reason: err.message };
  }
}

function getWsClientCount() {
  if (getClientCountFn) return getClientCountFn();
  return 0;
}

function getChannelStatus() {
  return {
    inApp: { configured: Boolean(wsBroadcastFn) },
    ntfy: { configured: Boolean(process.env.NTFY_TOPIC || true) },
    email: { configured: Boolean(process.env.SMTP_HOST) },
    slack: { configured: Boolean(process.env.SLACK_WEBHOOK_URL) },
    sms: { configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) },
  };
}

const CHANNEL_HANDLERS = {
  'in-app': sendInApp,
  ntfy: sendNtfy,
  email: sendEmail,
  slack: sendSlack,
  sms: sendSms,
};

async function dispatch(notification) {
  const { title, message, severity = 'info', channels, ...extra } = notification || {};
  const targets = channels && channels.length ? channels : ['in-app', 'ntfy'];
  const results = [];
  for (const channel of targets) {
    const handler = CHANNEL_HANDLERS[channel];
    if (!handler) {
      results.push({ channel, sent: false, reason: 'unknown-channel' });
      continue;
    }
    try {
      const result = await handler(title, message, severity, extra);
      results.push(result || { channel, sent: false, reason: 'no-result' });
    } catch (err) {
      logger.error('[NotificationDispatcher] dispatch failed', { channel, error: err.message });
      results.push({ channel, sent: false, reason: err.message });
    }
  }
  dispatchLog.unshift({
    id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title, message, severity, channels: targets,
    results, dispatched_at: new Date().toISOString(),
  });
  if (dispatchLog.length > MAX_LOG) dispatchLog.length = MAX_LOG;
  return results;
}

function getDispatchLog(limit = 50) {
  return dispatchLog.slice(0, limit);
}

function setWsBroadcaster(broadcastFn, clientCountFn) {
  wsBroadcastFn = broadcastFn;
  getClientCountFn = clientCountFn;
}

module.exports = {
  dispatch,
  sendInApp,
  sendNtfy,
  sendEmail,
  sendSlack,
  sendSms,
  getWsClientCount,
  getChannelStatus,
  getDispatchLog,
  setWsBroadcaster,
};
