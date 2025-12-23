/**
 * SSH Credential Resolution Utility
 * Handles decryption and resolution of SSH credentials from database
 */

import * as db from '../db/index.js';
import { decrypt } from '../encryption.js';
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

    // Decrypt private key
    if (storedKey.is_encrypted && storedKey.private_key_data.startsWith('{')) {
        const encryptedData = JSON.parse(storedKey.private_key_data);
        try {
            privateKey = decrypt(encryptedData, getJwtSecret());
        } catch (err) {
            console.warn('[Decryption] Failed with current secret, trying fallback');
            privateKey = decrypt(encryptedData, 'fortress-secret-key-change-in-production');
        }
    } else {
        privateKey = storedKey.private_key_data;
    }

    // Decrypt passphrase if present
    if (storedKey.passphrase && storedKey.passphrase.startsWith('{')) {
        const encryptedPass = JSON.parse(storedKey.passphrase);
        try {
            passphrase = decrypt(encryptedPass, getJwtSecret());
        } catch (err) {
            console.warn('[Decryption] Failed with current secret, trying fallback');
            passphrase = decrypt(encryptedPass, 'fortress-secret-key-change-in-production');
        }
    } else {
        passphrase = storedKey.passphrase;
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
