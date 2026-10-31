/**
 * JWT Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUserById } from '../db/users.js';

// Dynamic secret retrieval to support runtime updates
export const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
    return secret;
};

const authenticate = async (req: Request, res: Response, next: NextFunction, allowLinkToken: boolean) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    let payload: jwt.JwtPayload;
    try {
        payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const isLinkToken = payload.tokenUse === 'github_link';
    if ((isLinkToken && !allowLinkToken) ||
        (!isLinkToken && payload.tokenUse !== undefined && payload.tokenUse !== 'session')) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    try {
        const user = typeof payload.id === 'string' ? await getUserById(payload.id) : null;
        if (!user || payload.authEpoch !== user.auth_epoch ||
            (isLinkToken && (user.auth_type !== 'local' || user.github_id))) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        (req as any).user = user;
        next();
    } catch (error) {
        next(error);
    }
};

export const authenticateToken = (req: Request, res: Response, next: NextFunction) =>
    authenticate(req, res, next, false);

export const authenticateGitHubLink = (req: Request, res: Response, next: NextFunction) =>
    authenticate(req, res, next, true);

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    const id=(req as any).user?.id;
    if(typeof id!=='string' || id.length<1 || id.length>128)
        return res.status(403).json({error:'Admin required'});
    try{
        // JWT roles can become stale after an administrator is demoted or removed.
        // Authorization must be based on the current database identity.
        const user=await getUserById(id);
        if(user?.role!=='admin')
            return res.status(403).json({error:'Admin required'});
        (req as any).user={...user};
        next();
    }catch(error){next(error);}
};
