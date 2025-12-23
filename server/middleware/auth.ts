/**
 * JWT Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Dynamic secret retrieval to support runtime updates
export const getJwtSecret = () => {
    return process.env.JWT_SECRET || 'fortress-default-secret-change-in-production';
};

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, getJwtSecret(), (err: any, user: any) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        (req as any).user = user;
        next();
    });
};
