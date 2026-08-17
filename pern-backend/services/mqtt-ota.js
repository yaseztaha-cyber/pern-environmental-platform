/**
 * MQTT OTA push helpers.
 *
 * Contract (all messages published to `pern/devices/{deviceId}/ota`):
 *   { index: -1, kind: 'begin', size: <decoded binary size>, version: 'v1.0.0' }
 *   { index: 0..n-1, size: <chunk64 length>, chunk64: '<base64>' }
 *   { index: -2, kind: 'end', totalChunks: n }
 *
 * Device → backend progress/result is reported on `pern/devices/{deviceId}/ota/status`:
 *   { state: 'progress'|'done'|'error', percent, message, version }
 */

const OTA_MAX_FIRMWARE_BYTES = 2 * 1024 * 1024; // 2 MB binary
const OTA_CHUNK_SIZE = 4096; // base64 chars per chunk (~3 KB binary)

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function decodeSizeFromBase64Length(str) {
  const padding = str.endsWith('==') ? 2 : str.endsWith('=') ? 1 : 0;
  return (str.length / 4) * 3 - padding;
}

function buildOtaMessages(firmwareB64, { chunkSize = OTA_CHUNK_SIZE, version } = {}) {
  if (typeof firmwareB64 !== 'string' || firmwareB64.length === 0) {
    return { error: 'firmware (base64) is required' };
  }
  if (firmwareB64.length % 4 !== 0 || !BASE64_RE.test(firmwareB64)) {
    return { error: 'firmware must be valid base64' };
  }
  const decodedBytes = decodeSizeFromBase64Length(firmwareB64);
  if (decodedBytes > OTA_MAX_FIRMWARE_BYTES) {
    return { error: `firmware too large (max ${OTA_MAX_FIRMWARE_BYTES / 1024 / 1024} MB)` };
  }
  if (decodedBytes < 1024) {
    return { error: 'firmware looks too small to be valid' };
  }
  const messages = [{ index: -1, kind: 'begin', size: decodedBytes, version: version || '' }];
  let index = 0;
  for (let i = 0; i < firmwareB64.length; i += chunkSize) {
    messages.push({
      index,
      size: Math.min(chunkSize, firmwareB64.length - i),
      chunk64: firmwareB64.slice(i, i + chunkSize),
    });
    index++;
  }
  messages.push({ index: -2, kind: 'end', totalChunks: index });
  return { messages, totalChunks: index, decodedBytes };
}

async function publishOta(mqttClient, deviceId, messages, { delayMs = 15, onProgress } = {}) {
  if (!mqttClient || !mqttClient.connected) {
    return { success: false, error: 'MQTT not connected' };
  }
  const topic = `pern/devices/${deviceId}/ota`;
  for (const msg of messages) {
    const sent = mqttClient.publish(topic, JSON.stringify(msg));
    if (!sent) {
      return { success: false, error: 'MQTT publish failed', sentIndex: msg.index };
    }
    if (msg.index >= 0 && onProgress) onProgress(msg.index + 1, messages.length - 2);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { success: true, totalChunks: messages.length - 2 };
}

module.exports = { buildOtaMessages, publishOta, OTA_CHUNK_SIZE, OTA_MAX_FIRMWARE_BYTES };
