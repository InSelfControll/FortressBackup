/**
 * SSH Credential Resolution Utility
 * Handles decryption, resolution, and legacy migration of SSH credentials from database
 */

import * as db from '../db/index.js';
import { decrypt, encrypt } from '../encryption.js';
import { getJwtSecret } from '../middleware/auth.js';

export interface ResolvedSSHCredentials {
    privateKey?: string;
    passphrase?: string;
}

/**
 * Resolve SSH credentials from a stored SSH key
 */
export async function resolveSSHKeyCredentials(sshKeyId: string): Promise<ResolvedSSHCredentials> {
    const storedKey = await db.getSSHKey(sshKeyId);
    if (!storedKey) {
        throw new Error('SSH key not found');
    }

    let privateKey: string | undefined;
    let passphrase: string | undefined;
    const hasEncryptedPrivateKey = storedKey.is_encrypted && storedKey.private_key_data.startsWith('{');
    const hasEncryptedPassphrase = storedKey.passphrase?.startsWith('{') ?? false;
    const hasPlaintextPassphrase = typeof storedKey.passphrase === 'string'
        && storedKey.passphrase.length > 0
        && !hasEncryptedPassphrase;

    // Decrypt private key
    if (hasEncryptedPrivateKey) {
        const encryptedData = JSON.parse(storedKey.private_key_data);
        try {
            privateKey = decrypt(encryptedData, getJwtSecret());
        } catch {
            throw new Error('Unable to decrypt SSH key with configured encryption key');
        }
    } else {
        privateKey = storedKey.private_key_data;
    }

    // Decrypt passphrase if present
    if (hasEncryptedPassphrase) {
        const encryptedPass = JSON.parse(storedKey.passphrase!);
        try {
            passphrase = decrypt(encryptedPass, getJwtSecret());
        } catch {
            throw new Error('Unable to decrypt SSH key passphrase with configured encryption key');
        }
    } else {
        passphrase = storedKey.passphrase;
    }

    if (!hasEncryptedPrivateKey || hasPlaintextPassphrase) {
        const encryptionSecret = getJwtSecret();
        await db.saveSSHKey({
            ...storedKey,
            private_key_data: hasEncryptedPrivateKey
                ? storedKey.private_key_data
                : JSON.stringify(encrypt(privateKey!, encryptionSecret)),
            passphrase: hasPlaintextPassphrase
                ? JSON.stringify(encrypt(passphrase!, encryptionSecret))
                : storedKey.passphrase,
            is_encrypted: true
        });
    }

    console.log(`[SSH] Successfully resolved key: ${storedKey.name}`);
    return { privateKey, passphrase };
}

/**
 * Resolve SSH credentials from request body or system's assigned key
 */
export async function resolveSSHCredentialsFromRequest(
    requestBody: { privateKey?: string; passphrase?: string; password?: string; sshKeyId?: string },
    systemSSHKeyId?: string
): Promise<ResolvedSSHCredentials & { password?: string }> {
    let { privateKey, passphrase, password, sshKeyId } = requestBody;

    // Try sshKeyId from request first
    if (sshKeyId) {
        const resolved = await resolveSSHKeyCredentials(sshKeyId);
        return { ...resolved, password };
    }

    // If no key provided, try system's assigned key
    if (!privateKey && !password && systemSSHKeyId) {
        console.log(`[SSH] Using system's assigned SSH key: ${systemSSHKeyId}`);
        try {
            const resolved = await resolveSSHKeyCredentials(systemSSHKeyId);
            return { ...resolved, password };
        } catch (e) {
            console.error('[SSH] Failed to resolve system SSH key:', e);
        }
    }

    return { privateKey, passphrase, password };
}
