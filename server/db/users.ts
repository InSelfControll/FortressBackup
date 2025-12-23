/**
 * User Operations
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { run, getOne } from './helpers.js';

export interface User {
    id: string;
    email: string;
    name: string;
    password_hash?: string;
    avatar?: string;
    role: 'admin' | 'viewer';
    auth_type: 'local' | 'sso';
    created_at?: string;
}

export const createUser = async (user: Omit<User, 'id' | 'created_at'>, password?: string): Promise<User> => {
    const id = crypto.randomUUID();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    await run(
        `INSERT INTO users (id, email, name, password_hash, avatar, role, auth_type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, user.email, user.name, passwordHash, user.avatar || '', user.role, user.auth_type]
    );

    return { ...user, id };
};

export const validateUser = async (email: string, password: string): Promise<User | null> => {
    const user = await getOne<User>(`SELECT * FROM users WHERE email = ?`, [email]);

    if (!user || !user.password_hash) return null;

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return null;

    return user;
};

export const getUserById = async (id: string): Promise<User | null> => {
    return getOne<User>(`SELECT id, email, name, avatar, role, auth_type FROM users WHERE id = ?`, [id]);
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
    return getOne<User>(`SELECT id, email, name, avatar, role, auth_type FROM users WHERE email = ?`, [email]);
};

export const hasUsers = async (): Promise<boolean> => {
    const result = await getOne<{ count: number }>(`SELECT COUNT(*) as count FROM users`);
    return (result?.count || 0) > 0;
};
