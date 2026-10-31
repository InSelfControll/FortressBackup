/**
 * Authentication API endpoints
 */

import { API_BASE, apiFetch, getToken, setToken } from './client.js';
import { queryClient } from '../query.js';

export const clearClientSession = async () => {
    setToken(null);
    localStorage.removeItem('fortress_user_session');
    await queryClient.cancelQueries();
    queryClient.clear();
};

const replaceAuthenticatedToken = async (token: string) => {
    await clearClientSession();
    setToken(token);
};

export const subscribeToSessionTeardown = (onTeardown: () => void) => {
    const listener = async (event: StorageEvent) => {
        const sessionRemoved = event.newValue === null &&
            (event.key === null || event.key === 'fortress_token' || event.key === 'fortress_user_session');
        if (!sessionRemoved) return;
        await clearClientSession();
        onTeardown();
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
};

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    avatar: string;
    role: 'admin' | 'viewer';
}

export interface AuthResponse {
    user: AuthUser;
    token: string;
}

export const register = async (email: string, password: string, name: string, authType = 'local') => {
    const response = await apiFetch<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, authType })
    });

    if (response.data?.token) {
        await replaceAuthenticatedToken(response.data.token);
    }

    return response;
};

export const login = async (email: string, password: string) => {
    const response = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    if (response.data?.token) {
        await replaceAuthenticatedToken(response.data.token);
    } else if (response.linkToken) {
        await clearClientSession();
    }

    return response;
};

export const githubAuth = async (code: string) => {
    const response = await apiFetch<AuthResponse>('/auth/github/callback', {
        method: 'POST',
        body: JSON.stringify({ code })
    });

    if (response.data?.token) {
        await replaceAuthenticatedToken(response.data.token);
    }

    return response;
};

export const githubLink = async (code: string, linkToken?: string) => {
    const response = await apiFetch<AuthResponse>('/auth/github/link', {
        method: 'POST',
        headers: linkToken ? { Authorization: `Bearer ${linkToken}` } : undefined,
        body: JSON.stringify({ code })
    });
    if (response.data?.token) {
        await replaceAuthenticatedToken(response.data.token);
    }
    return response;
};

export const getMe = async () => {
    return apiFetch<{ user: AuthUser }>('/auth/me');
};

export const logout = async () => {
    try {
        const token = getToken();
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
    } finally {
        await clearClientSession();
    }
};
