import type { RequestHandler } from 'express';

interface AdmissionLimiterOptions {
    limit: number;
    windowMs: number;
    now?: () => number;
}

interface AdmissionEntry {
    count: number;
    resetAt: number;
}

export const createAdmissionLimiter = ({ limit, windowMs, now = Date.now }: AdmissionLimiterOptions): RequestHandler => {
    const entries = new Map<string, AdmissionEntry>();

    return (req, res, next) => {
        const timestamp = now();
        for (const [key, entry] of entries) {
            if (entry.resetAt <= timestamp) entries.delete(key);
        }

        const route = String(req.route?.path || req.baseUrl || req.path || 'unknown');
        const key = `${route}:${req.ip || 'unknown'}`;
        const existing = entries.get(key);
        const entry = existing || { count: 0, resetAt: timestamp + windowMs };

        if (entry.count >= limit) {
            res.status(429).json({ error: 'Too many requests' });
            return;
        }

        if (!existing && entries.size >= 10_000) {
            const oldest = entries.keys().next().value;
            if (oldest !== undefined) entries.delete(oldest);
        }

        entry.count++;
        if (!existing) entries.set(key, entry);
        next();
    };
};
