import { expect, test } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import { closeDatabase, initDatabase } from '../server/db/connection.js';
import { getUserById } from '../server/db/users.js';
import configRouter from '../server/routes/config.js';

const environmentKeys = [
  'FORTRESS_BOOTSTRAP_TOKEN',
  'FORTRESS_ENV_PATH',
  'JWT_SECRET',
  'FORTRESS_CREDENTIAL_KEY',
  'PORT',
  'DB_TYPE',
  'SQLITE_PATH',
  'AUTH_MODE',
  'FRONTEND_URL',
] as const;

test('first-run setup issues a token accepted by authenticateToken', async () => {
  const previousEnvironment = new Map(environmentKeys.map(key => [key, process.env[key]]));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-setup-token-'));
  const bootstrapToken = 'dummy-bootstrap-token-that-is-long-enough';
  process.env.FORTRESS_BOOTSTRAP_TOKEN = bootstrapToken;
  process.env.FORTRESS_ENV_PATH = path.join(directory, 'setup.env');
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.FORTRESS_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex');
  await initDatabase({ type: 'sqlite', filePath: path.join(directory, 'test.sqlite') });

  const app = express();
  app.use(express.json());
  app.use('/api/config', configRouter);
  const server = app.listen(0, '127.0.0.1');

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unable to bind test server');
    const base = `http://127.0.0.1:${address.port}/api/config`;
    const setupResponse = await fetch(`${base}/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fortress-bootstrap-token': bootstrapToken,
      },
      body: JSON.stringify({
        dbConfig: { type: 'sqlite', filePath: path.join(directory, 'configured.sqlite') },
        aiConfig: { provider: 'None' },
        ssoConfig: {},
        authMode: 'local',
        adminUser: {
          name: 'Dummy Admin',
          email: 'admin@example.invalid',
          password: 'dummy-password-123',
        },
        selectedTools: ['borg'],
      }),
    });
    expect(setupResponse.status).toBe(200);
    const setup = await setupResponse.json() as { token: string; user: { id: string } };
    const user = await getUserById(setup.user.id);
    expect(user?.auth_epoch).toBe(0);

    const authenticatedResponse = await fetch(`${base}/auth_mode`, {
      headers: { Authorization: `Bearer ${setup.token}` },
    });
    expect(authenticatedResponse.status).toBe(200);
    expect(await authenticatedResponse.json()).toEqual({ value: 'local' });

    const payload = jwt.verify(setup.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(payload.authEpoch).toBe(user?.auth_epoch);
  } finally {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    await closeDatabase();
    fs.rmSync(directory, { recursive: true, force: true });
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}, 30000);
