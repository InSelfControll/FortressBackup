/**
 * Strict SSH host-key verifier.
 * Operators enroll an OpenSSH public key or its SHA256 fingerprint out-of-band.
 * No trust-on-first-use and no automatic acceptance.
 */
import crypto from 'node:crypto';
import { validateHostPublicKey } from '../backup/rsync.js';

export function hostFingerprintFromPublicKey(publicKey: string): string {
    const [, encoded] = validateHostPublicKey(publicKey).split(/\s+/);
    const digest = crypto.createHash('sha256').update(Buffer.from(encoded, 'base64')).digest('base64');
    return `SHA256:${digest.replace(/=+$/, '')}`;
}

export function sshHostVerifier(fingerprint: string | undefined): (key: Buffer) => boolean {
    if (!fingerprint || !/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(fingerprint))
        throw new Error('A verified SSH host fingerprint (SHA256:base64) is required');
    const expected = Buffer.from(fingerprint.slice(7), 'base64');
    if (expected.length !== 32) throw new Error('Invalid SSH host fingerprint length');
    return (serverKey: Buffer): boolean => {
        const actual = crypto.createHash('sha256').update(serverKey).digest();
        return crypto.timingSafeEqual(actual, expected);
    };
}
