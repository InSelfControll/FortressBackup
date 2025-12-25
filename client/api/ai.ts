
import { apiFetch } from './client.js';
import { AIConfig } from '../../types.ts';

/**
 * Generate a backup configuration using AI (Backend Proxy)
 */
export const generateBackupConfig = async (prompt: string, config: AIConfig): Promise<any> => {
    return apiFetch<any>('/ai/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, config })
    });
};
