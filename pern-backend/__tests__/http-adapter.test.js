const HttpAdapter = require('../protocols/http-adapter');

describe('HttpAdapter', () => {
  let adapter;
  let baseUrl;

  beforeAll(async () => {
    adapter = new HttpAdapter(0);
    adapter.connect();
    await new Promise((resolve) => adapter.server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${adapter.server.address().port}`;
  });

  afterAll(async () => {
    adapter.disconnect();
    await new Promise((resolve) => adapter.server.once('close', resolve));
  });

  it('queues commands for delivery via polling', async () => {
    const result = adapter.sendCommand('dev-001', { actuator: 'led', value: 1 });
    expect(result.success).toBe(true);
    expect(result.queued).toBe(true);
    expect(result.commandId).toBeTruthy();

    const poll = await fetch(`${baseUrl}/api/devices/dev-001/commands`).then((r) => r.json());
    expect(poll.success).toBe(true);
    expect(poll.commands).toHaveLength(1);
    expect(poll.commands[0].command).toEqual({ actuator: 'led', value: 1 });
  });

  it('drains the queue after polling', async () => {
    const empty = await fetch(`${baseUrl}/api/devices/dev-001/commands`).then((r) => r.json());
    expect(empty.commands).toEqual([]);
  });

  it('accepts command acknowledgements', async () => {
    const ack = await fetch(`${baseUrl}/api/devices/dev-001/commands/some-id/ack`, {
      method: 'POST',
    }).then((r) => r.json());
    expect(ack).toEqual({ success: true, acknowledged: true, commandId: 'some-id' });
  });

  it('forwards ingested device data to the data callback', async () => {
    let received = null;
    adapter.onData((data) => { received = data; });

    await fetch(`${baseUrl}/api/devices/dev-002/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensors: { pm25: 12.4, temperature: 21.5 } }),
    });

    expect(received).not.toBeNull();
    expect(received.device).toBe('dev-002');
    expect(received.protocol).toBe('http');
    expect(received.sensors).toEqual({ pm25: 12.4, temperature: 21.5 });
  });

  it('reports health status', async () => {
    const health = await fetch(`${baseUrl}/health`).then((r) => r.json());
    expect(health).toEqual({ status: 'ok', protocol: 'http' });
  });
});
