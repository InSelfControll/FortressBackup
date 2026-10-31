# Authentication and Session Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close ten authentication, session, OAuth, and AI request-boundary leads with focused regression tests and minimal source changes.

**Architecture:** Keep Express routes and the existing SQLite/PostgreSQL user store, adding explicit GitHub-subject binding and per-user token epochs. Put request admission in a small middleware and outbound JSON limits in one shared helper used by GitHub and OpenAI-compatible flows. Browser cache and configuration teardown is a separate later phase.

**Tech Stack:** Bun 1.4.x, TypeScript, Express 5, `jsonwebtoken`, `bcryptjs`, Bun SQLite, PostgreSQL `pg`, Bun test.

## Global Constraints

- Use Bun for every JavaScript installation, execution, test, build, and type-check command. Do not use npm or Node commands.
- Follow TDD for every behavior change: write the focused test, observe the expected failure on the unmodified branch, then implement the minimal fix and rerun it.
- Extend `tests/security.test.ts` and existing conventions. Do not add a test framework or production dependency.
- Use dummy principals, secrets, databases, and loopback-only fixtures. Mock every GitHub and AI provider response; never contact a real provider or deployed system.
- Preserve current database-role authorization and existing provider configuration behavior except for the required security rejections.
- Each task covers only its named audit fingerprints and must leave all existing tests, build, and type checks passing.
- Commit each completed task with a Conventional Commit after its tests pass.

---

### Task 1: Enforce authentication mode and owner-specific bootstrap

**Files:**
- Modify: `server/routes/auth.ts`
- Modify: `server/db/users.ts`
- Test: `tests/security.test.ts`

**Interfaces:**
- Consumes: `db.getConfig('auth_mode')`, `db.validateUser`, `db.hasAdminUsers()`, and mocked GitHub identity responses.
- Produces: `hasAdminUsers(): Promise<boolean>` and HTTP 403 rejection when the selected login method is disabled.

Audit fingerprints: `server/auth:local-login-ignores-auth-mode`, `server/auth:github-callback-ignores-auth-mode`, `server/auth:sso-owner-bootstrap-global-user-check`.

- [ ] **Step 1: Add failing mode and bootstrap tests**

Mount `auth` on an isolated Express app with a temporary SQLite database and stub `globalThis.fetch` for GitHub token/user/email responses. Add tests equivalent to:

```ts
test('login methods enforce persisted auth mode', async () => {
  await saveConfig('auth_mode', 'sso');
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.invalid', password: 'correct-dummy-password' })
  });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: 'Local authentication is disabled' });
});

test('a first viewer does not consume the pinned owner bootstrap', async () => {
  process.env.FORTRESS_INITIAL_SSO_GITHUB_ID = '1002';
  expect((await githubCallback(nonOwner)).status).toBe(200);
  const ownerResponse = await githubCallback(owner);
  expect(ownerResponse.status).toBe(200);
  const owner = await getUserByEmail('owner@example.invalid');
  expect(owner?.role).toBe('admin');
});
```

Also set `auth_mode` to `local` and assert the GitHub callback returns 403 without creating a user. Restore fetch and environment state in `finally`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `bun test tests/security.test.ts -t 'login methods enforce persisted auth mode|a first viewer does not consume the pinned owner bootstrap'`
Expected: local login returns 200 in SSO mode, and the pinned owner becomes viewer after the first non-owner.

- [ ] **Step 3: Add the smallest server-side controls**

Before `db.validateUser` in `/login`, add:

```ts
const authMode = await db.getConfig<string>('auth_mode');
if (authMode === 'sso') {
  return res.status(403).json({ error: 'Local authentication is disabled' });
}
```

Before GitHub code exchange, add:

```ts
const authMode = await db.getConfig<string>('auth_mode');
if (authMode === 'local') {
  return res.status(403).json({ error: 'GitHub authentication is disabled' });
}
```

In `server/db/users.ts`, add:

```ts
export const hasAdminUsers = async (): Promise<boolean> => {
  const result = await getOne<{ count: number }>(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`);
  return (result?.count || 0) > 0;
};
```

Replace the `db.hasUsers()` owner predicate with `db.hasAdminUsers()`.

- [ ] **Step 4: Verify GREEN and the complete existing suite**

Run: `bun test tests/security.test.ts tests/managed-agents.test.ts`
Expected: 6 or more tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add server/routes/auth.ts server/db/users.ts tests/security.test.ts
git commit -m "fix(auth): enforce login policy and owner bootstrap"
```

### Task 2: Bind GitHub identities by subject and authenticated linking

**Files:**
- Modify: `server/db/schema.ts`
- Modify: `server/db/users.ts`
- Modify: `server/routes/auth.ts`
- Modify: `client/api/auth.ts`
- Test: `tests/security.test.ts`

**Interfaces:**
- Consumes: verified GitHub `id` and email from the callback exchange.
- Produces: nullable `User.github_id`, `getUserByGitHubId`, `linkGitHubIdentity`, `POST /api/auth/github/link`, and `githubLink(code)` in the browser API.

Audit fingerprint: `server/auth:github-email-implicit-account-link`.

- [ ] **Step 1: Add failing account-collision and linking tests**

Create a local administrator and mock a different GitHub ID presenting the same verified email. Assert the callback returns 403 and issues no token. Then authenticate as that administrator, call `/auth/github/link` with the code, and assert the callback for the bound GitHub ID subsequently succeeds. Include a second user attempting to bind the same GitHub ID and expect 409.

```ts
expect(unlinkedCallback.status).toBe(403);
expect(await unlinkedCallback.json()).toEqual({ error: 'Account linking required' });
expect(linkResponse.status).toBe(200);
expect((await getUserByEmail('admin@example.invalid'))?.github_id).toBe('1001');
expect(secondLinkResponse.status).toBe(409);
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `bun test tests/security.test.ts -t 'GitHub subject binding'`
Expected: unlinked callback returns 200 and `/auth/github/link` returns 404.

- [ ] **Step 3: Migrate and expose provider-subject fields**

Add nullable `github_id TEXT` to both user schemas and migrations, with a unique partial index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL;
```

Add `github_id?: string` to `User`; include it in create/read queries. Add:

```ts
export const getUserByGitHubId = async (githubId: string): Promise<User | null> =>
  getOne<User>(`SELECT id, email, name, avatar, role, auth_type, github_id FROM users WHERE github_id = ?`, [githubId]);

export const linkGitHubIdentity = async (userId: string, githubId: string): Promise<boolean> => {
  const result = await run(
    `UPDATE users SET github_id = ?, auth_type = 'sso' WHERE id = ? AND github_id IS NULL`,
    [githubId, userId]
  );
  return (result.changes || 0) === 1;
};
```

Check the current `run` result shape and use its actual change-count property. Handle unique-index conflicts as HTTP 409.

- [ ] **Step 4: Require linking before existing-account callback login**

Factor the existing GitHub token/user/email exchange into `exchangeGitHubCode(code)` within `server/routes/auth.ts`. In the callback, first call `getUserByGitHubId(String(githubUser.id))`. If no subject-bound user exists but `getUserByEmail(email)` returns a record, return 403 `{error:'Account linking required'}`. Only create a new user when neither record exists, storing `github_id`.

Add authenticated `/github/link` using the same exchange and `linkGitHubIdentity`. Add browser API:

```ts
export const githubLink = async (code: string) => apiFetch<{ success: boolean }>('/auth/github/link', {
  method: 'POST',
  body: JSON.stringify({ code })
});
```

- [ ] **Step 5: Verify GREEN and commit**

Run: `bun test tests/security.test.ts tests/managed-agents.test.ts && bunx tsc --noEmit`
Expected: all tests and type check pass.

```bash
git add server/db/schema.ts server/db/users.ts server/routes/auth.ts client/api/auth.ts tests/security.test.ts
git commit -m "fix(auth): bind GitHub identities by subject"
```

### Task 3: Add persisted token revocation

**Files:**
- Modify: `server/db/schema.ts`
- Modify: `server/db/users.ts`
- Modify: `server/middleware/auth.ts`
- Modify: `server/routes/auth.ts`
- Modify: `client/api/auth.ts`
- Modify: `tests/managed-agents.test.ts`
- Test: `tests/security.test.ts`

**Interfaces:**
- Consumes: `auth_epoch` on the current database user and the matching JWT claim.
- Produces: `bumpAuthEpoch(userId)`, `POST /api/auth/logout`, and asynchronous client `logout()` that always clears local token state.

Audit fingerprint: `server/auth:jwt-logout-replay`.

- [ ] **Step 1: Add a failing replay test**

Sign a token with `authEpoch: 0`, assert an administrator read succeeds, call `/auth/logout`, then replay the same token and require 403. Keep an incorrect-epoch control.

```ts
expect((await authorizedRequest(token)).status).toBe(200);
expect((await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
expect((await authorizedRequest(token)).status).toBe(403);
```

- [ ] **Step 2: Run the replay test and verify RED**

Run: `bun test tests/security.test.ts -t 'logout revokes bearer tokens'`
Expected: logout is 404 and the replay remains accepted.

- [ ] **Step 3: Add token epochs and revocation**

Add `auth_epoch INTEGER NOT NULL DEFAULT 0` to both schemas. Include `auth_epoch` in user reads and every new JWT as `authEpoch`. Add:

```ts
export const bumpAuthEpoch = async (id: string): Promise<void> => {
  await run(`UPDATE users SET auth_epoch = auth_epoch + 1 WHERE id = ?`, [id]);
};
```

Make `authenticateToken` asynchronous: verify HS256, load the current user, require `payload.authEpoch === user.auth_epoch`, then attach the current identity. Missing claims fail closed. Preserve `requireAdmin`'s fresh role check. Update every existing test token to include `authEpoch: 0`.

Add `/logout` after authentication, call `bumpAuthEpoch`, and return `{success:true}`. Import `API_BASE` and `getToken` in `client/api/auth.ts`, then use a direct request that cannot recursively invoke the API client's 401/403 logout handler:

```ts
export const logout = async () => {
  try {
    const token = getToken();
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  } finally {
    setToken(null);
    localStorage.removeItem('fortress_user_session');
  }
};
```

Update its callers to await it without blocking local cleanup on network failure.

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test tests/security.test.ts tests/managed-agents.test.ts && bunx tsc --noEmit`
Expected: all tests and type check pass.

```bash
git add server/db/schema.ts server/db/users.ts server/middleware/auth.ts server/routes/auth.ts client/api/auth.ts tests/security.test.ts tests/managed-agents.test.ts
git commit -m "fix(auth): revoke sessions on logout"
```

### Task 4: Bound public login admission

**Files:**
- Create: `server/middleware/admission.ts`
- Modify: `server/routes/auth.ts`
- Test: `tests/security.test.ts`

**Interfaces:**
- Consumes: `req.ip`, route name, and an injectable clock for deterministic tests.
- Produces: `createAdmissionLimiter({ limit, windowMs, now? })` Express middleware and HTTP 429 after the allowed count.

Audit fingerprint: `server/auth/login-bcrypt-admission`.

- [ ] **Step 1: Write failing limiter behavior tests**

Use a fake clock and dummy middleware calls. Verify the first ten requests call `next()`, the eleventh returns 429, and the next window admits again. Verify two IPs have separate buckets and expired entries are deleted.

```ts
const limiter = createAdmissionLimiter({ limit: 10, windowMs: 60_000, now: () => now });
for (let i = 0; i < 10; i++) await invoke(limiter, req, res);
expect(next).toHaveBeenCalledTimes(10);
await invoke(limiter, req, res);
expect(res.statusCode).toBe(429);
```

- [ ] **Step 2: Run the limiter tests and verify RED**

Run: `bun test tests/security.test.ts -t 'login admission'`
Expected: module `server/middleware/admission.ts` does not exist.

- [ ] **Step 3: Implement bounded admission**

Implement a Map of `{count, resetAt}` keyed by route and IP. Limit the map to 10,000 entries, removing expired entries on each request and the oldest entry when full. Export the factory and mount `createAdmissionLimiter({limit:10,windowMs:60_000})` only on `/login`. Mount a separate 30-per-minute limiter on `/github/callback` and `/github/link` if those routes already exist.

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test tests/security.test.ts tests/managed-agents.test.ts && bunx tsc --noEmit`
Expected: all tests and type check pass.

```bash
git add server/middleware/admission.ts server/routes/auth.ts tests/security.test.ts
git commit -m "fix(auth): bound public login admission"
```

### Task 5: Add bounded JSON fetching for GitHub OAuth

**Files:**
- Create: `server/utils/http.ts`
- Modify: `server/routes/auth.ts`
- Test: `tests/security.test.ts`

**Interfaces:**
- Consumes: URL, `RequestInit`, timeout, maximum body bytes, and optional caller `AbortSignal`.
- Produces: `fetchJsonWithLimits()` returning status, ok, and parsed JSON, with timeout, disconnect abort, and body-cap errors.

Audit fingerprint: `server/auth/github-callback-fetch-lifecycle`.

- [ ] **Step 1: Add failing helper tests**

Mock `globalThis.fetch` to inspect `redirect`, timeout cancellation, and streamed bodies. Assert a pending fetch aborts on the caller signal and a body over 1 MiB rejects before JSON parsing.

```ts
await expect(fetchJsonWithLimits('https://provider.invalid/user', {}, {
  timeoutMs: 20,
  maxBytes: 1_048_576,
  signal: controller.signal
})).rejects.toThrow('aborted');
```

Use small dummy bodies only; emulate the cap with a reduced `maxBytes` value in the oversized test.

- [ ] **Step 2: Run the helper tests and verify RED**

Run: `bun test tests/security.test.ts -t 'bounded JSON fetching'`
Expected: module `server/utils/http.ts` does not exist.

- [ ] **Step 3: Implement the helper and use it for all three GitHub calls**

Use an internal `AbortController`, forward the caller signal, set a timeout, and apply `redirect: 'error'`. Read the response body with `getReader()`, reject after `maxBytes`, and parse the bounded text as JSON. Return `{status, ok, data}`. Clear the timer and remove the abort listener in `finally`.

In `exchangeGitHubCode`, use 15-second deadlines and 1 MiB caps for token, user, and email calls. Connect the callback request's abort/close event to a controller passed into the helper.

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test tests/security.test.ts tests/managed-agents.test.ts && bunx tsc --noEmit`
Expected: all tests and type check pass.

```bash
git add server/utils/http.ts server/routes/auth.ts tests/security.test.ts
git commit -m "fix(auth): bound OAuth provider requests"
```

### Task 6: Constrain OpenAI-compatible responses and redirects

**Files:**
- Modify: `server/services/ai/generator.ts`
- Modify: `server/routes/ai.ts`
- Test: `tests/security.test.ts`

**Interfaces:**
- Consumes: `fetchJsonWithLimits` and the existing administrator-only AI route.
- Produces: no redirects, 30-second deadline, 1 MiB response cap, and disconnect cancellation for direct OpenAI-compatible generation.

Audit fingerprints: `server/services/ai/generator.ts:openai-redirect-target-not-revalidated`, `server/ai/openai-response-lifecycle`.

- [ ] **Step 1: Add failing AI fetch-policy tests**

Configure an OpenAI-compatible provider, mock fetch to return a redirect, and assert generation rejects without parsing a model configuration. Add a streamed-body cap test and assert the request receives an abort signal and 30-second policy.

```ts
await expect(generateBackupConfig(config)).rejects.toThrow('redirect');
expect(init.redirect).toBe('error');
expect(init.signal).toBeInstanceOf(AbortSignal);
```

- [ ] **Step 2: Run the AI tests and verify RED**

Run: `bun test tests/security.test.ts -t 'OpenAI-compatible request policy'`
Expected: current fetch follows its default policy and buffers without the shared cap.

- [ ] **Step 3: Apply the shared helper**

Replace only the direct OpenAI-compatible `fetch`/`response.json` path with `fetchJsonWithLimits`, using `timeoutMs: 30_000`, `maxBytes: 1_048_576`, and the route's disconnect signal. Preserve the existing HTTPS hostname allowlist, prompt bound, JSON response shape, and Gemini branch. Pass the optional signal from `/api/ai/generate` into `generateBackupConfig` without changing its other call sites.

- [ ] **Step 4: Verify GREEN and full phase verification**

Run: `bun test tests/security.test.ts tests/managed-agents.test.ts && bun run build && bunx tsc --noEmit && git diff --check`
Expected: all tests, build, type check, and whitespace check pass.

- [ ] **Step 5: Commit**

```bash
git add server/services/ai/generator.ts server/routes/ai.ts tests/security.test.ts
git commit -m "fix(ai): constrain compatible provider requests"
```
