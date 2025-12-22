
/**
 * Fortress Encryption Service
 * Uses Web Crypto API for secure, browser-native AES-GCM 256-bit encryption.
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_DERIVATION_ALGORITHM = 'PBKDF2';
const HASH_ALGORITHM = 'SHA-256';
const ITERATIONS = 100000;

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: KEY_DERIVATION_ALGORITHM },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: KEY_DERIVATION_ALGORITHM,
      salt,
      iterations: ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    passwordKey,
    { name: ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(text: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    encoder.encode(text)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  const decoder = new TextDecoder();
  const ciphertextBuffer = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const ivBuffer = Uint8Array.from(atob(iv), c => c.charCodeAt(0));

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGORITHM, iv: ivBuffer },
    key,
    ciphertextBuffer
  );

  return decoder.decode(decryptedBuffer);
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function bufferToBase64(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer));
}

export function base64ToBuffer(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
