import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'bun:test';
import { closeDatabase, initDatabase } from '../server/db/connection.js';
import { saveConfig } from '../server/db/config.js';
import { createUser, getUserByEmail } from '../server/db/users.js';
import auth from '../server/routes/auth.js';

const previousFetch = globalThis.fetch;

const startAuthServer = async () => {
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.FORTRESS_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-auth-remediation-'));
  await initDatabase({ type: 'sqlite', filePath: path.join(directory, 'db.sqlite') });
  await saveConfig('sso_config', {
    provider: 'github',
    clientId: 'dummy-client',
    clientSecret: 'dummy-secret'
  });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', auth);
  const server = app.listen(0, '127.0.0.1');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to bind test server');
  return {
    base: `http://127.0.0.1:${address.port}/api/auth`,
    close: async () => {
      globalThis.fetch = previousFetch;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await closeDatabase();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
};

const useDummyGitHub = (githubId: number, email: string) => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://github.com/login/oauth/access_token') {
      return Response.json({ access_token: 'dummy-provider-token', token_type: 'bearer', scope: 'user:email' });
    }
    if (url === 'https://api.github.com/user') {
      return Response.json({
        id: githubId,
        login: 'dummy-user',
        name: 'Dummy User',
        avatar_url: 'https://example.invalid/avatar.png'
      });
    }
    if (url === 'https://api.github.com/user/emails') {
      return Response.json([{ email, primary: true, verified: true, visibility: 'private' }]);
    }
    return previousFetch(input, init);
  }) as typeof fetch;
};

const post = (base: string, route: string, body: unknown, token?: string) => fetch(base + route, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  },
  body: JSON.stringify(body)
});

test('invalid and revoked token identity returns 401 while authorization policy remains 403', async () => {
  const fixture = await startAuthServer();
  try {
    await saveConfig('auth_mode', 'local');
    const viewer = await createUser({
      email: 'viewer@example.invalid',
      name: 'Viewer',
      role: 'viewer',
      auth_type: 'local'
    }, 'viewer-dummy-password');
    const viewerToken = jwt.sign({ id: viewer.id, authEpoch: 0, tokenUse: 'session' }, process.env.JWT_SECRET!);
    const policyResponse = await post(fixture.base, '/register', {}, viewerToken);
    expect(policyResponse.status).toBe(403);

    const malformedResponse = await fetch(`${fixture.base}/me`, {
      headers: { Authorization: 'Bearer not-a-valid-token' }
    });
    expect(malformedResponse.status).toBe(401);

    const logoutResponse = await post(fixture.base, '/logout', {}, viewerToken);
    expect(logoutResponse.status).toBe(200);
    const revokedResponse = await fetch(`${fixture.base}/me`, {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    expect(revokedResponse.status).toBe(401);
  } finally {
    await fixture.close();
  }
}, 30_000);

test('SSO password proof issues a scoped linking grant and completes browser linking without a pre-link session', async () => {
  const fixture = await startAuthServer();
  try {
    const user = await createUser({
      email: 'local@example.invalid',
      name: 'Local User',
      role: 'admin',
      auth_type: 'local'
    }, 'correct-dummy-password');
    await saveConfig('auth_mode', 'sso');
    useDummyGitHub(1001, user.email);

    const callbackBeforeProof = await post(fixture.base, '/github/callback', { code: 'dummy-code' });
    expect(callbackBeforeProof.status).toBe(403);
    expect(await callbackBeforeProof.json()).toEqual({ error: 'Account linking required' });

    const rejectedProof = await post(fixture.base, '/login', {
      email: user.email,
      password: 'wrong-dummy-password'
    });
    expect(rejectedProof.status).toBe(401);

    const proofResponse = await post(fixture.base, '/login', {
      email: user.email,
      password: 'correct-dummy-password'
    });
    expect(proofResponse.status).toBe(403);
    const proof = await proofResponse.json() as any;
    expect(proof.error).toBe('Account linking required');
    expect(typeof proof.linkToken).toBe('string');
    expect(proof.token).toBeUndefined();

    const preLinkSession = await fetch(`${fixture.base}/me`, {
      headers: { Authorization: `Bearer ${proof.linkToken}` }
    });
    expect(preLinkSession.status).toBe(401);

    const linkResponse = await post(fixture.base, '/github/link', { code: 'dummy-code' }, proof.linkToken);
    expect(linkResponse.status).toBe(200);
    const linked = await linkResponse.json() as any;
    expect(linked.user.id).toBe(user.id);
    expect(typeof linked.token).toBe('string');
    expect((await getUserByEmail(user.email))?.github_id).toBe('1001');

    const linkedSession = await fetch(`${fixture.base}/me`, {
      headers: { Authorization: `Bearer ${linked.token}` }
    });
    expect(linkedSession.status).toBe(200);

    const normalPasswordLogin = await post(fixture.base, '/login', {
      email: user.email,
      password: 'correct-dummy-password'
    });
    expect(normalPasswordLogin.status).toBe(403);
    const rejected = await normalPasswordLogin.json() as any;
    expect(rejected.error).toBe('Local authentication is disabled');
    expect(rejected.linkToken).toBeUndefined();
  } finally {
    await fixture.close();
  }
}, 30_000);

test('GitHub callback migrates a legacy SSO user by verified email exactly once', async () => {
  const fixture = await startAuthServer();
  try {
    const legacy = await createUser({
      email: 'legacy@example.invalid',
      name: 'Legacy SSO',
      role: 'admin',
      auth_type: 'sso'
    }, 'legacy-dummy-password');
    await saveConfig('auth_mode', 'sso');
    useDummyGitHub(2002, legacy.email);

    const migratedResponse = await post(fixture.base, '/github/callback', { code: 'dummy-code' });
    expect(migratedResponse.status).toBe(200);
    const migrated = await migratedResponse.json() as any;
    expect(migrated.user.id).toBe(legacy.id);
    expect(typeof migrated.token).toBe('string');
    expect((await getUserByEmail(legacy.email))?.github_id).toBe('2002');

    const linkedResponse = await post(fixture.base, '/github/callback', { code: 'dummy-code' });
    expect(linkedResponse.status).toBe(200);
    expect((await getUserByEmail(legacy.email))?.github_id).toBe('2002');

    const passwordResponse = await post(fixture.base, '/login', {
      email: legacy.email,
      password: 'legacy-dummy-password'
    });
    expect(passwordResponse.status).toBe(403);
  } finally {
    await fixture.close();
  }
}, 30_000);
