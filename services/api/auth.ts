/**
 * Authentication API endpoints
 */

import { apiFetch, setToken } from './client.js';

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    avatar?: string;
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
        setToken(response.data.token);
    }

    return response;
};

export const login = async (email: string, password: string) => {
    const response = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    if (response.data?.token) {
        setToken(response.data.token);
    }

    return response;
};

export const githubAuth = async (code: string) => {
    const response = await apiFetch<AuthResponse>('/auth/github/callback', {
        method: 'POST',
        body: JSON.stringify({ code })
    });

    if (response.data?.token) {
        setToken(response.data.token);
    }

    return response;
};

export const getMe = async () => {
    return apiFetch<{ user: AuthUser }>('/auth/me');
};

export const logout = () => {
    setToken(null);
    localStorage.removeItem('fortress_user_session');
};
