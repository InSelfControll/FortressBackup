/**
 * Authentication Routes
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import * as db from '../db/index.js';
import { getJwtSecret, authenticateToken, requireAdmin } from '../middleware/auth.js';
import { selectVerifiedGitHubEmail } from '../security/githubIdentity.js';

const router = Router();
const validEmail=(value:unknown):value is string =>
    typeof value==='string' && value.length>=3 && value.length<=254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validName=(value:unknown):value is string =>
    typeof value==='string' && value.trim().length>=1 && value.length<=120 &&
    !/[\u0000-\u001f\u007f]/.test(value);


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

        // Generate token
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, authEpoch: user.auth_epoch }, getJwtSecret(), { expiresIn: '7d' });

        res.json({
            user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role },
            token
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if(!validEmail(email)||typeof password!=='string'||password.length<1||password.length>256)
            return res.status(400).json({error:'Invalid login credentials'});

        const authMode = await db.getConfig<string>('auth_mode');
        if (authMode === 'sso') {
            return res.status(403).json({ error: 'Local authentication is disabled' });
        }

        const user = await db.validateUser(email, password);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, authEpoch: user.auth_epoch }, getJwtSecret(), { expiresIn: '7d' });

        res.json({
            user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role },
            token
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

const exchangeGitHubCode = async (code: string) => {
    const ssoConfig = await db.getConfig<any>('sso_config');
    if (!ssoConfig || ssoConfig.provider !== 'github') {
        return { status: 400, error: 'GitHub SSO not configured' };
    }

    const authMode = await db.getConfig<string>('auth_mode');
    if (authMode === 'local') {
        return { status: 403, error: 'GitHub authentication is disabled' };
    }

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
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
    });
    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
        return { status: 400, error: tokenData.error_description || 'Failed to exchange code' };
    }

    const userResponse = await fetch('https://api.github.com/user', {
        headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Fortress-Backup-Manager'
        }
    });
    const githubUser = await userResponse.json();
    if (!githubUser.id) {
        return { status: 400, error: 'Failed to get GitHub user info' };
    }

    const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'Fortress-Backup-Manager'
        }
    });
    if (!emailsResponse.ok) return { status: 403, error: 'Verified GitHub email access is required' };
    const emailRecords: unknown = await emailsResponse.json();
    const email = selectVerifiedGitHubEmail(emailRecords);
    if (!email) return { status: 403, error: 'Verified GitHub email required' };

    return { githubUser, email };
};

const isUniqueConstraintError = (error: any): boolean =>
    error?.code === '23505' || String(error?.message || '').includes('UNIQUE constraint failed');

// GitHub OAuth callback
router.post('/github/callback', async (req, res) => {
    try {
        const { code } = req.body;
        if (typeof code !== 'string' || code.length < 1 || code.length > 2048) {
            return res.status(400).json({ error: 'Authorization code required' });
        }

        const exchange = await exchangeGitHubCode(code);
        if ('error' in exchange) return res.status(exchange.status).json({ error: exchange.error });
        const { githubUser, email } = exchange;
        const githubId = String(githubUser.id);

        let user = await db.getUserByGitHubId(githubId);
        if (!user) {
            if (await db.getUserByEmail(email)) {
                return res.status(403).json({ error: 'Account linking required' });
            }

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

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, authEpoch: user.auth_epoch }, getJwtSecret(), { expiresIn: '7d' });
        res.json({
            user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role },
            token
        });
    } catch (error: any) {
        if (isUniqueConstraintError(error)) {
            return res.status(409).json({ error: 'Account linking conflict' });
        }
        console.error('[GitHub OAuth Error]', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/github/link', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body || {};
        if (typeof code !== 'string' || code.length < 1 || code.length > 2048) {
            return res.status(400).json({ error: 'Authorization code required' });
        }

        const exchange = await exchangeGitHubCode(code);
        if ('error' in exchange) return res.status(exchange.status).json({ error: exchange.error });

        const linked = await db.linkGitHubIdentity((req as any).user.id, String(exchange.githubUser.id));
        if (!linked) return res.status(409).json({ error: 'Account linking conflict' });
        res.json({ success: true });
    } catch (error: any) {
        if (isUniqueConstraintError(error)) {
            return res.status(409).json({ error: 'Account linking conflict' });
        }
        console.error('[GitHub Link Error]', error);
        res.status(500).json({ error: error.message });
    }
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
