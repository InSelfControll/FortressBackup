/**
 * Authentication Routes
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import * as db from '../db/index.js';
import { getJwtSecret, authenticateToken } from '../middleware/auth.js';

const router = Router();

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, authType = 'local' } = req.body;

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
            role: 'admin',
            auth_type: authType
        }, authType === 'local' ? password : undefined);

        // Generate token
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, getJwtSecret(), { expiresIn: '7d' });

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
        const { email, password } = req.body;

        const user = await db.validateUser(email, password);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, getJwtSecret(), { expiresIn: '7d' });

        res.json({
            user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role },
            token
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GitHub OAuth callback
router.post('/github/callback', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code required' });
        }

        // Get SSO config for client secret
        const ssoConfig = await db.getConfig<any>('sso_config');
        if (!ssoConfig || ssoConfig.provider !== 'github') {
            return res.status(400).json({ error: 'GitHub SSO not configured' });
        }

        // Exchange code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: ssoConfig.clientId,
                client_secret: ssoConfig.clientSecret,
                code: code
            })
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return res.status(400).json({ error: tokenData.error_description || 'Failed to exchange code' });
        }

        // Get user info from GitHub
        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Fortress-Backup-Manager'
            }
        });

        const githubUser = await userResponse.json();

        if (!githubUser.id) {
            return res.status(400).json({ error: 'Failed to get GitHub user info' });
        }

        // Get user email (might be private)
        let email = githubUser.email;
        if (!email) {
            const emailsResponse = await fetch('https://api.github.com/user/emails', {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Fortress-Backup-Manager'
                }
            });
            const emails = await emailsResponse.json();
            const primaryEmail = emails.find((e: any) => e.primary) || emails[0];
            email = primaryEmail?.email || `${githubUser.login}@github.local`;
        }

        // Check if user exists, otherwise create
        let user = await db.getUserByEmail(email);

        if (!user) {
            user = await db.createUser({
                email,
                name: githubUser.name || githubUser.login,
                avatar: githubUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${githubUser.login}`,
                role: 'admin',
                auth_type: 'sso'
            });
        }

        // Generate JWT token
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, getJwtSecret(), { expiresIn: '7d' });

        res.json({
            user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role },
            token
        });
    } catch (error: any) {
        console.error('[GitHub OAuth Error]', error);
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
