import { networkInterfaces } from 'node:os';

const FALLBACK_IP = '127.0.0.1';
const FALLBACK_MAC = '00:00:00:00:00:00';

/**
 * Angel One's login API requires best-effort client identification headers
 * for fraud detection. We supply what we can determine locally; there is no
 * reliable way to determine the true public IP without an external service
 * call, so that one is a configurable placeholder (see getPublicIp()).
 */
export function getLocalIp(): string {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return FALLBACK_IP;
}

export function getMacAddress(): string {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.mac && entry.mac !== FALLBACK_MAC) {
        return entry.mac;
      }
    }
  }
  return FALLBACK_MAC;
}

export function getPublicIp(): string {
  return FALLBACK_IP;
}
