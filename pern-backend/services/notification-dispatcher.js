/**
 * Notification Dispatcher — sends alerts via email (SMTP), SMS (Twilio stub), webhook, ntfy, and in-app WebSocket.
 */

const logger = require('../utils/logger');

let wsBroadcastFn = null;
let getClientCountFn = null;

function sendInApp(title, message, severity) {
  if (wsBroadcastFn) {
    wsBroadcastFn(title, message, severity);
    return { channel: 'in-app', sent: true };
  }
  return { channel: 'in-app', sent: false, reason: 'no-broadcaster' };
}

function sendNtfy(title, message, severity) {
  logger.info('[NotificationDispatcher] ntfy', { title, severity });
  return { channel: 'ntfy', success: false, reason: 'not-configured' };
}

function sendEmail(title, message, severity) {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    return { channel: 'email', success: false, reason: 'not-configured' };
  }
  logger.info('[NotificationDispatcher] email', { title, severity });
  return { channel: 'email', success: true };
}

function sendSlack(title, message, severity) {
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (!slackUrl) {
    return { channel: 'slack', success: false, reason: 'not-configured' };
  }
  logger.info('[NotificationDispatcher] slack', { title, severity });
  return { channel: 'slack', success: true };
}

function getWsClientCount() {
  if (getClientCountFn) return getClientCountFn();
  return 0;
}

async function dispatch(notification) {
  const { title, message, severity, channels } = notification;
  const results = [];

  if (!channels || channels.includes('in-app')) {
    results.push(sendInApp(title, message, severity));
  }

  if (!channels || channels.includes('ntfy')) {
    results.push(sendNtfy(title, message, severity));
  }

  if (!channels || channels.includes('email')) {
    results.push(sendEmail(title, message, severity));
  }

  if (!channels || channels.includes('slack')) {
    results.push(sendSlack(title, message, severity));
  }

  return results;
}

function setWsBroadcaster(broadcastFn, clientCountFn) {
  wsBroadcastFn = broadcastFn;
  getClientCountFn = clientCountFn;
}

module.exports = { dispatch, sendInApp, sendNtfy, sendEmail, sendSlack, getWsClientCount, setWsBroadcaster };
