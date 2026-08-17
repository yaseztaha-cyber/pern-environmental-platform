/**
 * MQTT OTA Tests
 * Covers firmware chunking and the OTA publish sequence over a mock MQTT client.
 */

const { buildOtaMessages, publishOta } = require('../services/mqtt-ota');

function mockMqttClient({ connected = true, failAfter = Infinity } = {}) {
  let publishCount = 0;
  const published = [];
  return {
    connected,
    published,
    publish(topic, payload) {
      publishCount++;
      if (publishCount > failAfter) return false;
      published.push({ topic, payload: JSON.parse(payload) });
      return true;
    },
  };
}

describe('buildOtaMessages', () => {
  it('rejects empty / non-base64 firmware', () => {
    expect(buildOtaMessages('').error).toBeDefined();
    expect(buildOtaMessages('!!!not-base64!!!').error).toContain('base64');
    expect(buildOtaMessages('AA==ABC').error).toContain('base64');
  });

  it('rejects oversized firmware', () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
    expect(buildOtaMessages(big).error).toContain('too large');
  });

  it('rejects suspiciously small firmware', () => {
    const tiny = Buffer.from('hello').toString('base64');
    expect(buildOtaMessages(tiny).error).toContain('too small');
  });

  it('builds begin/chunk/end sequence with valid decoded size', () => {
    const binary = Buffer.alloc(5000, 7);
    const b64 = binary.toString('base64');
    const { messages, decodedBytes } = buildOtaMessages(b64, { version: 'v1.2.3' });
    expect(messages[0]).toEqual({ index: -1, kind: 'begin', size: 5000, version: 'v1.2.3' });
    expect(decodedBytes).toBe(5000);

    const chunks = messages.slice(1, -1);
    expect(chunks.every((c) => c.index >= 0 && c.size === c.chunk64.length)).toBe(true);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(chunks[i - 1].index + 1);
    }

    const last = messages[messages.length - 1];
    expect(last).toEqual({ index: -2, kind: 'end', totalChunks: chunks.length });

    const rejoin = chunks.map((c) => c.chunk64).join('');
    expect(rejoin).toBe(b64);
  });
});

describe('publishOta', () => {
  it('rejects when MQTT is disconnected', async () => {
    const client = mockMqttClient({ connected: false });
    const { messages } = buildOtaMessages(Buffer.alloc(2048).toString('base64'));
    const result = await publishOta(client, 'esp-01', messages);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('publishes every message in order on the canonical topic', async () => {
    const client = mockMqttClient();
    const { messages, totalChunks } = buildOtaMessages(Buffer.alloc(5000).toString('base64'));
    const result = await publishOta(client, 'esp-01', messages, { delayMs: 0 });
    expect(result.success).toBe(true);
    expect(result.totalChunks).toBe(totalChunks);
    expect(client.published.length).toBe(messages.length);
    client.published.forEach((p) => {
      expect(p.topic).toBe('pern/devices/esp-01/ota');
    });
    expect(client.published[0].payload.kind).toBe('begin');
    expect(client.published[client.published.length - 1].payload.kind).toBe('end');
  });

  it('reports publish failures with the failed index', async () => {
    const client = mockMqttClient({ failAfter: 2 });
    const { messages } = buildOtaMessages(Buffer.alloc(3000).toString('base64'));
    const result = await publishOta(client, 'esp-01', messages, { delayMs: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('publish failed');
    expect(typeof result.sentIndex).toBe('number');
  });

  it('invokes onProgress for each chunk', async () => {
    const client = mockMqttClient();
    const { messages, totalChunks } = buildOtaMessages(Buffer.alloc(10000).toString('base64'));
    const progress = [];
    await publishOta(client, 'esp-01', messages, {
      delayMs: 0,
      onProgress: (done, total) => progress.push({ done, total }),
    });
    expect(progress.length).toBe(totalChunks);
    expect(progress[progress.length - 1]).toEqual({ done: totalChunks, total: totalChunks });
  });
});
