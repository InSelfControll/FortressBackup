import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../server/db/connection.js';
import { getSSHKey, saveSSHKey, type SSHKey } from '../server/db/sshKeys.js';
import { decrypt, encrypt } from '../server/encryption.js';
import { resolveSSHKeyCredentials } from '../server/utils/sshCredentials.js';

const jwtSecret = 'dummy-jwt-secret-for-ssh-credential-tests-123456789';
const legacyPrivateKey = '-----BEGIN DUMMY PRIVATE KEY-----\nlegacy-private-key\n-----END DUMMY PRIVATE KEY-----';
const legacyPassphrase = 'dummy-legacy-passphrase';
let directory: string;
let previousJwtSecret: string | undefined;

const storedKey = (overrides: Partial<SSHKey>): SSHKey => ({
    id: 'dummy-key-id',
    name: 'Dummy key',
    private_key_data: legacyPrivateKey,
    passphrase: legacyPassphrase,
    is_encrypted: false,
    expiry_date: '2030-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    key_order: 3,
    ...overrides
});

beforeEach(async () => {
    previousJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = jwtSecret;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-ssh-credentials-'));
    await initDatabase({ type: 'sqlite', filePath: path.join(directory, 'db.sqlite') });
});

afterEach(async () => {
    await closeDatabase();
    fs.rmSync(directory, { recursive: true, force: true });
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
});

test('resolving a legacy key encrypts its plaintext private key and passphrase in storage', async () => {
    await saveSSHKey(storedKey({}));

    await expect(resolveSSHKeyCredentials('dummy-key-id')).resolves.toEqual({
        privateKey: legacyPrivateKey,
        passphrase: legacyPassphrase
    });

    const migrated = await getSSHKey('dummy-key-id');
    expect(migrated).not.toBeNull();
    expect(migrated?.is_encrypted).toBeTruthy();
    expect(migrated?.private_key_data).not.toContain(legacyPrivateKey);
    expect(migrated?.passphrase).not.toContain(legacyPassphrase);
    expect(decrypt(JSON.parse(migrated!.private_key_data), jwtSecret)).toBe(legacyPrivateKey);
    expect(decrypt(JSON.parse(migrated!.passphrase!), jwtSecret)).toBe(legacyPassphrase);
    expect(migrated?.created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(migrated?.key_order).toBe(3);
});

test('resolving mixed records encrypts only their plaintext fields', async () => {
    const encryptedPassphrase = JSON.stringify(encrypt(legacyPassphrase, jwtSecret));
    const encryptedPrivateKey = JSON.stringify(encrypt(legacyPrivateKey, jwtSecret));
    await saveSSHKey(storedKey({ id: 'plaintext-private', passphrase: encryptedPassphrase }));
    await saveSSHKey(storedKey({
        id: 'plaintext-passphrase',
        private_key_data: encryptedPrivateKey,
        is_encrypted: true
    }));

    await resolveSSHKeyCredentials('plaintext-private');
    await resolveSSHKeyCredentials('plaintext-passphrase');

    const migratedPrivate = await getSSHKey('plaintext-private');
    expect(migratedPrivate?.is_encrypted).toBeTruthy();
    expect(migratedPrivate?.private_key_data).not.toBe(legacyPrivateKey);
    expect(decrypt(JSON.parse(migratedPrivate!.private_key_data), jwtSecret)).toBe(legacyPrivateKey);
    expect(migratedPrivate?.passphrase).toBe(encryptedPassphrase);

    const migratedPassphrase = await getSSHKey('plaintext-passphrase');
    expect(migratedPassphrase?.private_key_data).toBe(encryptedPrivateKey);
    expect(migratedPassphrase?.passphrase).not.toBe(legacyPassphrase);
    expect(decrypt(JSON.parse(migratedPassphrase!.passphrase!), jwtSecret)).toBe(legacyPassphrase);
});

test('resolving an encrypted key leaves its stored ciphertext unchanged', async () => {
    const encryptedPrivateKey = JSON.stringify(encrypt(legacyPrivateKey, jwtSecret));
    const encryptedPassphrase = JSON.stringify(encrypt(legacyPassphrase, jwtSecret));
    await saveSSHKey(storedKey({
        private_key_data: encryptedPrivateKey,
        passphrase: encryptedPassphrase,
        is_encrypted: true
    }));

    await expect(resolveSSHKeyCredentials('dummy-key-id')).resolves.toEqual({
        privateKey: legacyPrivateKey,
        passphrase: legacyPassphrase
    });

    const unchanged = await getSSHKey('dummy-key-id');
    expect(unchanged?.private_key_data).toBe(encryptedPrivateKey);
    expect(unchanged?.passphrase).toBe(encryptedPassphrase);
    expect(unchanged?.is_encrypted).toBeTruthy();
});
