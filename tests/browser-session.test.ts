import React from 'react';
import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { Sidebar } from '../components/layout/Sidebar.tsx';
import { queryClient } from '../client/query.ts';
import type { User } from '../types.ts';

class LocalStorageMock {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

const storage = new LocalStorageMock();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalFetch = globalThis.fetch;
let client: typeof import('../client/api/client.ts');
let auth: typeof import('../client/api/auth.ts');

const admin: User = {
  id: 'admin-id',
  email: 'admin@example.invalid',
  name: 'Admin',
  role: 'admin',
  avatar: '/dummy-avatar.png',
};

const viewer: User = {
  id: 'viewer-id',
  email: 'viewer@example.invalid',
  name: 'Viewer',
  role: 'viewer',
  avatar: '/dummy-avatar.png',
};

test('cold API imports and session teardown do not require browser styles or a document', async () => {
  // A fresh process prevents an earlier UI import from hiding an import-order bug.
  const child = Bun.spawn([process.execPath, '--eval', `
    import { strict as assert } from 'node:assert';
    const values = new Map();
    globalThis.localStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    };
    globalThis.window = { location: { pathname: '/settings', href: '/settings' } };
    assert.equal(typeof document, 'undefined');
    globalThis.fetch = async input => String(input) === '/api/auth/logout'
      ? Response.json({ success: true })
      : Response.json({ error: 'Invalid token' }, { status: 401 });
    const api = await import('./client/api/index.ts');
    const { queryClient } = await import('./client/query.ts');
    api.setToken('disposable-expired-session');
    localStorage.setItem('fortress_user_session', 'disposable-user');
    queryClient.setQueryData(['private-records'], ['disposable-private-record']);
    const mutation = queryClient.getMutationCache().build(queryClient, {
      gcTime: 0,
      mutationFn: async () => { throw new Error('disposable mutation failure'); },
    });
    await assert.rejects(mutation.execute(null), /disposable mutation failure/);
    assert.deepEqual(await api.apiFetch('/systems'), { error: 'Session expired' });
    assert.equal(api.getToken(), null);
    assert.equal(localStorage.getItem('fortress_user_session'), null);
    assert.equal(queryClient.getQueryCache().getAll().length, 0);
    assert.equal(queryClient.getMutationCache().getAll().length, 0);
    assert.equal(window.location.href, '/');
  `], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const deadline = setTimeout(() => child.kill(), 4_000);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ exitCode, output: exitCode === 0 ? '' : stdout + stderr }).toEqual({ exitCode: 0, output: '' });
  } finally {
    clearTimeout(deadline);
    child.kill();
  }
});

beforeAll(async () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  client = await import('../client/api/client.ts');
  auth = await import('../client/api/auth.ts');
});

beforeEach(() => {
  storage.clear();
  queryClient.clear();
  client.setToken(null);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  queryClient.clear();
  if (originalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('deployment API configuration stays same-origin', async () => {
  expect(client.API_BASE).toBe('/api');
  const source = await Bun.file(
    new URL('../components/systems/DeploymentTerminal.tsx', import.meta.url),
  ).text();
  expect(source).not.toContain('http://localhost:9001');
  expect(source).toContain('${API_BASE}/config/selected_tools');
  expect(source).toContain('${API_BASE}/systems/${system.id}/deploy');
});

test('logout revokes locally and clears every principal-independent cache', async () => {
  const requests: string[] = [];
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  client.setToken('dummy-admin-bearer');
  storage.setItem('fortress_user_session', JSON.stringify(admin));
  queryClient.setQueryData(['systems'], [{ name: 'private-admin-system' }]);
  queryClient.setQueryData(['config', 'admin'], { apiKey: 'dummy-admin-secret' });

  await auth.logout();

  expect(requests).toEqual(['/api/auth/logout']);
  expect(client.getToken()).toBeNull();
  expect(storage.getItem('fortress_token')).toBeNull();
  expect(storage.getItem('fortress_user_session')).toBeNull();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});

test('successful account switch removes the previous principal and cached records', async () => {
  globalThis.fetch = mock(async () => new Response(JSON.stringify({
    user: viewer,
    token: 'dummy-viewer-bearer',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof fetch;

  client.setToken('dummy-admin-bearer');
  storage.setItem('fortress_user_session', JSON.stringify(admin));
  queryClient.setQueryData(['systems'], [{ name: 'private-admin-system' }]);
  queryClient.setQueryData(['jobs'], [{ name: 'private-admin-job' }]);

  const response = await auth.login(viewer.email, 'dummy-password');

  expect(response.data?.user.role).toBe('viewer');
  expect(client.getToken()).toBe('dummy-viewer-bearer');
  expect(storage.getItem('fortress_user_session')).toBeNull();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});

test('rejected sessions finish bearer and cache teardown before returning', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalWarn = console.warn;
  console.warn = mock(() => {});
  let requestCount = 0;
  let finishLogout!: (response: Response) => void;
  globalThis.fetch = mock(async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(JSON.stringify({ error: 'expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Promise<Response>((resolve) => {
      finishLogout = resolve;
    });
  }) as unknown as typeof fetch;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: { location: { pathname: '/', reload: mock(() => {}) } },
  });

  client.setToken('dummy-expired-bearer');
  storage.setItem('fortress_user_session', JSON.stringify(admin));
  queryClient.setQueryData(['systems'], [{ name: 'private-admin-system' }]);

  let result: Awaited<ReturnType<typeof client.apiFetch>> | undefined;
  let settled = false;
  try {
    const pending = client.apiFetch('/systems').then((value) => {
      result = value;
      settled = true;
    });
    for (let index = 0; index < 20 && !settled && requestCount < 2; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const settledBeforeLogout = settled;
    if (requestCount === 2) {
      finishLogout(new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    await pending;

    expect(settledBeforeLogout).toBe(false);
    expect(result?.error).toBe('Session expired');
    expect(client.getToken()).toBeNull();
    expect(storage.getItem('fortress_token')).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  } finally {
    console.warn = originalWarn;
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('SSO linking grant is used only for GitHub linking before a normal session is issued', async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get('Authorization') });
    if (url === '/api/auth/login') {
      return Response.json({ error: 'Account linking required', linkToken: 'dummy-link-grant' }, { status: 403 });
    }
    if (url === '/api/auth/github/link') {
      return Response.json({ user: admin, token: 'dummy-linked-session' });
    }
    return Response.json({ error: 'unexpected request' }, { status: 500 });
  }) as unknown as typeof fetch;

  client.setToken('dummy-stale-session');
  const proof = await auth.login(admin.email, 'correct-dummy-password');

  expect(proof.error).toBe('Account linking required');
  expect(proof.linkToken).toBe('dummy-link-grant');
  expect(client.getToken()).toBeNull();

  const linked = await auth.githubLink('dummy-oauth-code', proof.linkToken);

  expect(linked.data?.user.id).toBe(admin.id);
  expect(client.getToken()).toBe('dummy-linked-session');
  expect(requests).toEqual([
    { url: '/api/auth/login', authorization: 'Bearer dummy-stale-session' },
    { url: '/api/auth/github/link', authorization: 'Bearer dummy-link-grant' }
  ]);
});

test('cross-tab token removal clears user, query cache, and notifies secret-state teardown', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let storageListener: ((event: { key: string | null; newValue: string | null }) => Promise<void>) | undefined;
  const removeEventListener = mock(() => {});
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: mock((type: string, listener: typeof storageListener) => {
        if (type === 'storage') storageListener = listener;
      }),
      removeEventListener
    }
  });

  try {
    expect(typeof auth.subscribeToSessionTeardown).toBe('function');
    const onTeardown = mock(() => {});
    const unsubscribe = auth.subscribeToSessionTeardown(onTeardown);
    client.setToken('dummy-other-tab-token');
    storage.setItem('fortress_user_session', JSON.stringify(admin));
    queryClient.setQueryData(['config', 'admin'], { apiKey: 'dummy-secret' });

    await storageListener?.({ key: 'fortress_token', newValue: null });

    expect(client.getToken()).toBeNull();
    expect(storage.getItem('fortress_user_session')).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(onTeardown).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith('storage', storageListener);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('viewer navigation does not expose administrator settings', () => {
  const html = renderToStaticMarkup(React.createElement(Sidebar, {
    currentView: 'dashboard',
    setCurrentView: () => {},
    currentUser: viewer,
    onLogout: () => {},
  }));

  expect(html).not.toContain('Settings');
  expect(html).not.toContain('Managed Clients');
});

test('public SSO state excludes the administrator client secret', async () => {
  const appModule = await import('../App.tsx');
  expect(typeof appModule.getPublicSsoConfig).toBe('function');

  const publicConfig = appModule.getPublicSsoConfig({
    provider: 'github',
    clientId: 'dummy-public-client',
    clientSecret: 'dummy-private-secret',
    discoveryUrl: 'https://identity.example.invalid',
  });

  expect(publicConfig).toEqual({
    provider: 'github',
    clientId: 'dummy-public-client',
    discoveryUrl: 'https://identity.example.invalid',
  });
  expect(JSON.stringify(publicConfig)).not.toContain('dummy-private-secret');
});

test('data export denies viewers and excludes secret-bearing configuration', async () => {
  const appModule = await import('../App.tsx');
  expect(typeof appModule.createDataExport).toBe('function');

  const input = {
    currentUser: viewer,
    systems: [{ name: 'private-admin-system' }],
    jobs: [{ name: 'private-admin-job' }],
    locations: [{ name: 'private-admin-location' }],
    aiConfig: { provider: 'openai', apiKey: 'dummy-ai-secret' },
    dbConfig: { type: 'postgres', password: 'dummy-database-secret' },
    ssoConfig: { provider: 'github', clientSecret: 'dummy-sso-secret' },
  };

  expect(appModule.createDataExport(input)).toBeNull();

  const exported = appModule.createDataExport({ ...input, currentUser: admin });
  expect(exported?.systems).toEqual(input.systems);
  expect(exported?.jobs).toEqual(input.jobs);
  expect(exported?.locations).toEqual(input.locations);
  expect(JSON.stringify(exported)).not.toContain('dummy-ai-secret');
  expect(JSON.stringify(exported)).not.toContain('dummy-database-secret');
  expect(JSON.stringify(exported)).not.toContain('dummy-sso-secret');
});
