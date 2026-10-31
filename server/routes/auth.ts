/**
 * Authentication Routes
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import * as db from '../db/index.js';
import { getJwtSecret, authenticateToken, authenticateGitHubLink, requireAdmin } from '../middleware/auth.js';
import { selectVerifiedGitHubEmail } from '../security/githubIdentity.js';
import { createAdmissionLimiter } from '../middleware/admission.js';
import { fetchJsonWithLimits } from '../utils/http.js';

const router = Router();
const loginAdmission = createAdmissionLimiter({ limit: 10, windowMs: 60_000 });
const githubAdmission = createAdmissionLimiter({ limit: 30, windowMs: 60_000 });
const passwordAdmission = createAdmissionLimiter({ limit: 5, windowMs: 60_000 });
const validEmail=(value:unknown):value is string =>
    typeof value==='string' && value.length>=3 && value.length<=254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validName=(value:unknown):value is string =>
    typeof value==='string' && value.trim().length>=1 && value.length<=120 &&
    !/[\u0000-\u001f\u007f]/.test(value);

const signSessionToken = (user: { id: string; email: string; role: string; auth_epoch: number }) =>
    jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        authEpoch: user.auth_epoch,
        tokenUse: 'session'
    }, getJwtSecret(), { expiresIn: '7d' });

// Register new user
router.post('/register', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { email, password, name, authType = 'local' } = req.body || {};
        if(!validEmail(email)||!validName(name)||!['local','sso'].includes(authType)||
           (authType==='local' && (typeof password!=='string'||password.length<12||password.length>256)))
            return res.status(400).json({error:'Invalid registration data'});

        // Check if user already exists
        const existing = await db.getUserByEmail(email);
        if (existing) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Create user
        const user = await db.createUser({
            email,
            name,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
            role: 'viewer',
            auth_type: authType
        }, authType === 'local' ? password : undefined);

        res.json({
            user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role },
            token: signSessionToken(user)
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Login
router.post('/login', loginAdmission, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if(!validEmail(email)||typeof password!=='string'||password.length<1||password.length>256)
            return res.status(400).json({error:'Invalid login credentials'});

        const user = await db.validateUser(email, password);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const authMode = await db.getConfig<string>('auth_mode');
        if (authMode === 'sso') {
            if (user.auth_type === 'local' && !user.github_id) {
                const linkToken = jwt.sign({
                    id: user.id,
                    authEpoch: user.auth_epoch,
                    tokenUse: 'github_link'
                }, getJwtSecret(), { expiresIn: '10m' });
                return res.status(403).json({ error: 'Account linking required', linkToken });
            }
            return res.status(403).json({ error: 'Local authentication is disabled' });
        }

        res.json({
            user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role },
            token: signSessionToken(user)
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

const exchangeGitHubCode = async (code: string, signal?: AbortSignal) => {
    const ssoConfig = await db.getConfig<any>('sso_config');
    if (!ssoConfig || ssoConfig.provider !== 'github') {
        return { status: 400, error: 'GitHub SSO not configured' };
    }

    const requestLimits = { timeoutMs: 15_000, maxBytes: 1_048_576, signal };
    const tokenResponse = await fetchJsonWithLimits('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: ssoConfig.clientId,
            client_secret: ssoConfig.clientSecret,
            code
        })
    }, requestLimits);
    const tokenData = tokenResponse.data;
    if (tokenData.error) {
        return { status: 400, error: tokenData.error_description || 'Failed to exchange code' };
    }

    const userResponse = await fetchJsonWithLimits('https://api.github.com/user', {
        headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Fortress-Backup-Manager'
        }
    }, requestLimits);
    const githubUser = userResponse.data;
    if (!githubUser.id) {
        return { status: 400, error: 'Failed to get GitHub user info' };
    }

    const emailsResponse = await fetchJsonWithLimits('https://api.github.com/user/emails', {
        headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'Fortress-Backup-Manager'
        }
    }, requestLimits);
    if (!emailsResponse.ok) return { status: 403, error: 'Verified GitHub email access is required' };
    const emailRecords: unknown = emailsResponse.data;
    const email = selectVerifiedGitHubEmail(emailRecords);
    if (!email) return { status: 403, error: 'Verified GitHub email required' };

    return { githubUser, email };
};

const isUniqueConstraintError = (error: any): boolean =>
    error?.code === '23505' || String(error?.message || '').includes('UNIQUE constraint failed');

// GitHub OAuth callback
router.post('/github/callback', githubAdmission, async (req, res) => {
    const controller = new AbortController();
    const disconnect = () => controller.abort(new Error('Client disconnected'));
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    try {
        const { code } = req.body;
        if (typeof code !== 'string' || code.length < 1 || code.length > 2048) {
            return res.status(400).json({ error: 'Authorization code required' });
        }

        const authMode = await db.getConfig<string>('auth_mode');
        if (authMode === 'local') {
            return res.status(403).json({ error: 'GitHub authentication is disabled' });
        }

        const exchange = await exchangeGitHubCode(code, controller.signal);
        if ('error' in exchange) return res.status(exchange.status).json({ error: exchange.error });
        const { githubUser, email } = exchange;
        const githubId = String(githubUser.id);

        let user = await db.getUserByGitHubId(githubId);
        if (!user) {
            const existing = await db.getUserByEmail(email);
            if (existing) {
                if (existing.auth_type !== 'sso' || existing.github_id) {
                    return res.status(403).json({ error: 'Account linking required' });
                }
                const linked = await db.linkGitHubIdentity(existing.id, githubId);
                if (!linked) return res.status(409).json({ error: 'Account linking conflict' });
                user = { ...existing, github_id: githubId };
            } else {
                // Never let an arbitrary first OAuth login seize administrator rights.
                // An operator can explicitly pin the sole bootstrap GitHub user ID.
                const initialId = process.env.FORTRESS_INITIAL_SSO_GITHUB_ID;
                const owner = !!initialId && /^[0-9]+$/.test(initialId) &&
                    githubId === initialId && !(await db.hasAdminUsers());
                user = await db.createUser({
                    email,
                    name: githubUser.name || githubUser.login,
                    avatar: githubUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${githubUser.login}`,
                    role: owner ? 'admin' : 'viewer',
                    auth_type: 'sso',
                    github_id: githubId
                });
            }
        }

        res.json({
            user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role },
            token: signSessionToken(user)
        });
    } catch (error: any) {
        if (controller.signal.aborted) return;
        if (isUniqueConstraintError(error)) {
            return res.status(409).json({ error: 'Account linking conflict' });
        }
        console.error('[GitHub OAuth Error]', error);
        res.status(500).json({ error: error.message });
    } finally {
        req.off('aborted', disconnect);
        res.off('close', disconnect);
    }
});

router.post('/github/link', githubAdmission, authenticateGitHubLink, async (req, res) => {
    const controller = new AbortController();
    const disconnect = () => controller.abort(new Error('Client disconnected'));
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    try {
        const { code } = req.body || {};
        if (typeof code !== 'string' || code.length < 1 || code.length > 2048) {
            return res.status(400).json({ error: 'Authorization code required' });
        }

        const exchange = await exchangeGitHubCode(code, controller.signal);
        if ('error' in exchange) return res.status(exchange.status).json({ error: exchange.error });

        const githubId = String(exchange.githubUser.id);
        const currentUser = (req as any).user;
        const linked = await db.linkGitHubIdentity(currentUser.id, githubId);
        if (!linked) return res.status(409).json({ error: 'Account linking conflict' });
        const user = { ...currentUser, auth_type: 'sso' as const, github_id: githubId };
        res.json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role },
            token: signSessionToken(user)
        });
    } catch (error: any) {
        if (controller.signal.aborted) return;
        if (isUniqueConstraintError(error)) {
            return res.status(409).json({ error: 'Account linking conflict' });
        }
        console.error('[GitHub Link Error]', error);
        res.status(500).json({ error: error.message });
    } finally {
        req.off('aborted', disconnect);
        res.off('close', disconnect);
    }
});

router.post('/password', passwordAdmission, authenticateToken, async (req, res) => {
    try {
        const user = (req as any).user as db.User;
        const { currentPassword, newPassword } = req.body || {};
        if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 256 ||
            typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256)
            return res.status(400).json({ error: 'Enter your current password and a new password of 12–256 characters' });
        if (await db.getConfig<string>('auth_mode') === 'sso')
            return res.status(400).json({ error: 'Change your password through your identity provider' });
        const verified = await db.validateUser(user.email, currentPassword);
        if (!verified) return res.status(400).json({ error: 'Current password is incorrect' });
        const hash = await bcrypt.hash(newPassword, 10);
        const updated = await db.getOne<db.User>(
            'UPDATE users SET password_hash=?,auth_epoch=auth_epoch+1 WHERE id=? AND auth_epoch=? RETURNING id,email,role,auth_epoch',
            [hash, user.id, user.auth_epoch]);
        if (!updated) return res.status(409).json({ error: 'Your session changed. Sign in again before updating your password.' });
        res.json({ success: true, token: signSessionToken(updated) });
    } catch { res.status(500).json({ error: 'Password update failed' }); }
});

router.post('/logout', authenticateToken, async (req, res) => {
    try {
        await db.bumpAuthEpoch((req as any).user.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await db.getUserById((req as any).user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
