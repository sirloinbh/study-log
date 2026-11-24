import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

// Keeps the Google refresh token encrypted at rest and signs the OAuth `state` (#366). The key is
// CALENDAR_TOKEN_KEY: 32 random bytes, base64. Nothing here logs or returns the key or a token.
export function parseKey(text: string | undefined): Buffer | undefined {
  if (!text) return undefined;
  const key = Buffer.from(text.trim(), 'base64');
  return key.length === 32 ? key : undefined;
}

// iv (12) + auth tag (16) + ciphertext, base64.
export function encryptToken(plain: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

// Throws when the key is wrong or the text was changed.
export function decryptToken(encrypted: string, key: Buffer) {
  const raw = Buffer.from(encrypted, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

const stateLifetimeMs = 10 * 60 * 1000;

const sign = (payload: string, key: Buffer) =>
  createHmac('sha256', key).update(`calendar-state:${payload}`).digest('base64url');

// `<expiry ms>.<nonce>.<signature>`: only this server can make one, and it stops working after ten minutes.
export function makeState(key: Buffer, now = Date.now()) {
  const payload = `${now + stateLifetimeMs}.${randomBytes(12).toString('base64url')}`;
  return `${payload}.${sign(payload, key)}`;
}

export function checkState(state: string, key: Buffer, now = Date.now()) {
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(parts[0]) > now;
}
