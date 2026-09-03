import crypto from 'node:crypto';
import { env } from '../config/env.js';

// ENCRYPTION_KEY is an arbitrary-length passphrase (see env.ts); hashing it
// down to 32 bytes gives AES-256-GCM a key of the exact size it requires.
const key = crypto.createHash('sha256').update(env.ENCRYPTION_KEY).digest();

/**
 * Encrypt a secret (e.g. a team's own Anthropic API key) for storage in Postgres.
 * Output is `iv.tag.ciphertext`, each base64 — safe to store in a single text column.
 */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString('base64')).join('.');
}

/** Reverse of `encryptSecret`. Throws if the payload is malformed or the key doesn't match. */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret payload');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
