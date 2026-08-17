const dispatcher = require('../services/notification-dispatcher');

describe('Notification Center API Routes', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const express = require('express');
    const notificationsRouter = require('../routes/notifications');
    const app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationsRouter);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    server.close();
    await new Promise((resolve) => server.once('close', resolve));
  });

  it('GET /status reports channels and client count', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/status`).then((r) => r.json());
    expect(typeof res.channels.email.configured).toBe('boolean');
    expect(typeof res.channels.ntfy.configured).toBe('boolean');
    expect(typeof res.clients).toBe('number');
  });

  it('GET /log returns a dispatch log array', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/log?limit=5`).then((r) => r.json());
    expect(Array.isArray(res.entries)).toBe(true);
  });

  it('POST /send dispatches and appears in the log', async () => {
    const body = {
      title: 'API Test Notification',
      message: 'Dispatched via route integration test',
      severity: 'info',
      channels: ['in-app'],
    };
    const res = await fetch(`${baseUrl}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    expect(res.success).toBe(true);
    expect(res.results).toEqual(expect.any(Array));

    const log = await fetch(`${baseUrl}/api/notifications/log`).then((r) => r.json());
    expect(log.entries[0].title).toBe('API Test Notification');
  });
});

describe('Notification Dispatcher Service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SMTP_HOST;
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM;
    delete process.env.NTFY_BASE_URL;
  });

  it('should export dispatch and setWsBroadcaster functions', () => {
    expect(typeof dispatcher.dispatch).toBe('function');
    expect(typeof dispatcher.setWsBroadcaster).toBe('function');
  });

  it('should handle in-app WebSocket broadcasting when configured', async () => {
    const mockBroadcast = vi.fn();
    dispatcher.setWsBroadcaster(mockBroadcast, () => 1);

    const results = await dispatcher.dispatch({
      title: 'High Turbidity Detected',
      message: 'Turbidity exceeded 15 NTU on River Sensor 1',
      severity: 'critical',
      channels: ['in-app'],
    });

    expect(mockBroadcast).toHaveBeenCalledWith(
      'High Turbidity Detected',
      'Turbidity exceeded 15 NTU on River Sensor 1',
      'critical'
    );
    expect(results).toEqual([{ channel: 'in-app', sent: true }]);
  });

  it('should default to in-app + ntfy when no channels given', async () => {
    dispatcher.setWsBroadcaster(() => {}, () => 1);
    const results = await dispatcher.dispatch({
      title: 'Test',
      message: 'Test message',
      severity: 'info',
    });
    expect(results.map((r) => r.channel)).toEqual(['in-app', 'ntfy']);
  });

  it('should mark unconfigured email channel as not-configured', async () => {
    const results = await dispatcher.dispatch({
      title: 'T', message: 'M', severity: 'info', channels: ['email'],
    });
    expect(results[0]).toEqual({ channel: 'email', sent: false, reason: 'not-configured' });
  });

  it('should mark unconfigured slack channel as not-configured', async () => {
    const results = await dispatcher.dispatch({
      title: 'T', message: 'M', severity: 'info', channels: ['slack'],
    });
    expect(results[0]).toEqual({ channel: 'slack', sent: false, reason: 'not-configured' });
  });

  it('should mark unconfigured sms channel as not-configured', async () => {
    const results = await dispatcher.dispatch({
      title: 'T', message: 'M', severity: 'info', channels: ['sms'],
    });
    expect(results[0]).toEqual({ channel: 'sms', sent: false, reason: 'not-configured' });
  });

  it('should return unknown-channel for unsupported channels', async () => {
    const results = await dispatcher.dispatch({
      title: 'T', message: 'M', severity: 'info', channels: ['pigeon'],
    });
    expect(results[0].channel).toBe('pigeon');
    expect(results[0].sent).toBe(false);
    expect(results[0].reason).toBe('unknown-channel');
  });

  it('sendNtfy posts to ntfy topic when fetch succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    process.env.NTFY_BASE_URL = 'https://ntfy.example.test';

    const result = await dispatcher.sendNtfy('Title', 'Body', 'critical', { tags: ['skull'] });
    expect(result).toEqual({ channel: 'ntfy', sent: true });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ntfy.example.test/pern-platform-alerts-2026');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Priority).toBe('5');
    expect(opts.body).toBe('Body');
  });

  it('sendNtfy reports failure when ntfy fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await dispatcher.sendNtfy('Title', 'Body', 'info');
    expect(result.channel).toBe('ntfy');
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('network down');
  });

  it('sendSms posts to Twilio when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_FROM = '+1000';
    process.env.TWILIO_TO = '+2000';

    const result = await dispatcher.sendSms('Title', 'Body', 'high');
    expect(result).toEqual({ channel: 'sms', sent: true });
    expect(fetchMock.mock.calls[0][0]).toContain('/2010-04-01/Accounts/AC123/Messages.json');
  });

  it('getChannelStatus reflects configuration', () => {
    const status = dispatcher.getChannelStatus();
    expect(typeof status.email).toBe('object');
    expect(typeof status.slack).toBe('object');
    expect(typeof status.sms).toBe('object');
    expect(typeof status.ntfy).toBe('object');
    expect(typeof status.inApp).toBe('object');
  });

  it('getDispatchLog records dispatched notifications in order', async () => {
    dispatcher.setWsBroadcaster(() => {}, () => 1);
    await dispatcher.dispatch({
      title: 'First', message: 'M1', severity: 'info', channels: ['in-app'],
    });
    await dispatcher.dispatch({
      title: 'Second', message: 'M2', severity: 'warning', channels: ['ntfy'],
    });

    const log = dispatcher.getDispatchLog(10);
    expect(Array.isArray(log)).toBe(true);
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0].title).toBe('Second');
    expect(log[0].severity).toBe('warning');
    expect(log[0].channels).toContain('ntfy');
    expect(log[0].results).toEqual(expect.any(Array));
    expect(typeof log[0].id).toBe('string');
    expect(new Date(log[0].dispatched_at).getTime()).toBeGreaterThan(0);
  });

  it('getDispatchLog honors the limit', async () => {
    dispatcher.setWsBroadcaster(() => {}, () => 1);
    for (let i = 0; i < 5; i += 1) {
      await dispatcher.dispatch({ title: `T${i}`, message: 'M', severity: 'info', channels: ['in-app'] });
    }
    expect(dispatcher.getDispatchLog(3).length).toBe(3);
  });

  it('getWsClientCount reports broadcaster client count', () => {
    dispatcher.setWsBroadcaster(() => {}, () => 7);
    expect(dispatcher.getWsClientCount()).toBe(7);
  });
});
