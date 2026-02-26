// API key generation utilities for Aether programmatic access.

import { createHash, randomBytes } from 'crypto';

export interface GeneratedApiKey {
  fullKey: string;
  prefix: string;
  hash: string;
}

const KEY_PREFIX = 'aeth_k1_';
const KEY_RANDOM_LENGTH = 40;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomAlphanumeric(length: number): string {
  const bytes = randomBytes(length);
  const chars = new Array<string>(length);

  for (let index = 0; index < length; index += 1) {
    const value = bytes[index] % ALPHABET.length;
    chars[index] = ALPHABET[value] ?? '0';
  }

  return chars.join('');
}

export function generateApiKey(): GeneratedApiKey {
  const randomPart = randomAlphanumeric(KEY_RANDOM_LENGTH);
  const fullKey = `${KEY_PREFIX}${randomPart}`;

  // Use a slightly longer prefix for display/lookup than the minimal example.
  const prefix = fullKey.slice(0, 16);
  const hash = createHash('sha256').update(fullKey).digest('hex');

  return {
    fullKey,
    prefix,
    hash,
  };
}

