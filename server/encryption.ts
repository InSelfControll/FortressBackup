/**
 * Fortress Server-Side Encryption Service
 * Uses Node.js crypto for AES-256-GCM encryption with PBKDF2 key derivation
 */

import crypto from 'crypto';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface EncryptedData {
    ciphertext: string; // Base64
    iv: string;         // Base64
    salt: string;       // Base64
    tag: string;        // Base64
}

/**
 * Derive a 256-bit key from a password using PBKDF2
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, KEY_DERIVATION_ITERATIONS, 32, 'sha256');
}

/**
 * Encrypt text using AES-256-GCM with password-based key derivation
 */
export function encrypt(text: string, password: string): EncryptedData {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tag = cipher.getAuthTag();

    return {
        ciphertext: encrypted,
        iv: iv.toString('base64'),
        salt: salt.toString('base64'),
        tag: tag.toString('base64')
    };
}

/**
 * Decrypt data using AES-256-GCM with password-based key derivation
 */
export function decrypt(data: EncryptedData, password: string): string {
    const salt = Buffer.from(data.salt, 'base64');
    const key = deriveKey(password, salt);
    const iv = Buffer.from(data.iv, 'base64');
    const tag = Buffer.from(data.tag, 'base64');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(data.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Generate a random encryption key for session-based encryption
 */
export function generateSessionKey(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt with a pre-shared key (no password derivation, faster)
 */
export function encryptWithKey(text: string, keyHex: string): EncryptedData {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tag = cipher.getAuthTag();

    return {
        ciphertext: encrypted,
        iv: iv.toString('base64'),
        salt: '', // Not used for key-based encryption
        tag: tag.toString('base64')
    };
}

/**
 * Decrypt with a pre-shared key
 */
export function decryptWithKey(data: EncryptedData, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(data.iv, 'base64');
    const tag = Buffer.from(data.tag, 'base64');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(data.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Hash a password for storage
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(password, salt, KEY_DERIVATION_ITERATIONS, 64, 'sha512');
    return salt.toString('hex') + ':' + hash.toString('hex');
}

/**
 * Verify a password against a stored hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
    const [saltHex, hashHex] = storedHash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const hash = crypto.pbkdf2Sync(password, salt, KEY_DERIVATION_ITERATIONS, 64, 'sha512');
    return hash.toString('hex') === hashHex;
}
