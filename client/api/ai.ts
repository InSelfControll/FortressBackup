
import { apiFetch } from './client.js';

/**
 * Generate a backup configuration using AI (Backend Proxy)
 */
export const generateBackupConfig = async (prompt: string): Promise<any> => {
    return apiFetch<any>('/ai/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt })
    });
};
