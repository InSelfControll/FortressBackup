/**
 * Health, Status, and Config API endpoints
 */

import { AIConfig, DatabaseConfig, SSOConfig } from '../../types.js';
import { apiFetch, setToken, API_BASE } from './client.js';
import { AuthUser } from './auth.js';

export const checkHealth = async () => {
    return apiFetch<{ status: string; timestamp: string }>('/health');
};

export const getStatus = async () => {
    return apiFetch<{ setupComplete: boolean; hasUsers: boolean; dbType: string }>('/status');
};

export const getConfig = async <T>(key: string) => {
    return apiFetch<{ value: T }>(`/config/${key}`);
};

export const saveConfig = async (key: string, value: any) => {
    return apiFetch<{ success: boolean }>(`/config/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value })
    });
};

export interface SetupData {
    aiConfig: AIConfig;
    dbConfig: DatabaseConfig;
    ssoConfig: SSOConfig;
    authMode: 'local' | 'sso';
    adminUser?: {
        email: string;
        password: string;
        name: string;
    };
}

export const completeSetup = async (data: SetupData) => {
    const response = await apiFetch<{ success: boolean; user?: AuthUser; token?: string }>('/config/setup', {
        method: 'POST',
        body: JSON.stringify(data)
    });

    if (response.data?.token) {
        setToken(response.data.token);
    }

    return response;
};

export const isApiAvailable = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${API_BASE}/health`, { method: 'GET' });
        return response.ok;
    } catch {
        return false;
    }
};
