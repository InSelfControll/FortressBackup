/**
 * API Client Core - Fetch wrapper and token management
 */

// @ts-ignore - Vite provides import.meta.env
const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

export interface ApiResponse<T> {
    data?: T;
    error?: string;
    linkToken?: string;
}

// Token management
let authToken: string | null = localStorage.getItem('fortress_token');

export const setToken = (token: string | null) => {
    authToken = token;
    if (token) {
        localStorage.setItem('fortress_token', token);
    } else {
        localStorage.removeItem('fortress_token');
    }
};

export const getToken = () => authToken;

/**
 * Generic fetch wrapper with auth handling
 */
export const apiFetch = async <T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> => {
    try {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (authToken) {
            (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                // Session expired or invalid
                console.warn(`[API] Auth error ${response.status}:`, data.error);
                // Import dynamically to avoid circular dependency
                const { logout } = await import('./auth');
                await logout();

                if (window.location.pathname !== '/') {
                    window.location.href = '/';
                } else {
                    window.location.reload();
                }
                return { error: 'Session expired' };
            }
            return {
                error: data.error || 'Request failed',
                ...(typeof data.linkToken === 'string' ? { linkToken: data.linkToken } : {})
            };
        }

        return { data };
    } catch (error: any) {
        console.error(`API Error [${endpoint}]:`, error);
        return { error: error.message || 'Network error' };
    }
};

export { API_BASE };
