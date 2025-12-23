/**
 * Resource CRUD API endpoints - Systems, Locations, Jobs, SSH Keys
 */

import { System, Location, BackupJob, SSHKey } from '../../types.js';
import { apiFetch } from './client.js';

// ==================== SYSTEMS ====================

export const getSystems = async () => {
    return apiFetch<System[]>('/systems');
};

export const createSystem = async (system: Omit<System, 'id'>) => {
    return apiFetch<System>('/systems', {
        method: 'POST',
        body: JSON.stringify(system)
    });
};

export const updateSystem = async (id: string, system: Partial<System>) => {
    return apiFetch<System>(`/systems/${id}`, {
        method: 'PUT',
        body: JSON.stringify(system)
    });
};

export const deleteSystem = async (id: string) => {
    return apiFetch<{ success: boolean }>(`/systems/${id}`, {
        method: 'DELETE'
    });
};

// ==================== SSH KEYS ====================

export const getSSHKeys = async () => {
    return apiFetch<SSHKey[]>('/keys');
};

export const createSSHKey = async (name: string, privateKey: string, passphrase?: string) => {
    return apiFetch<{ success: boolean; id: string }>('/keys', {
        method: 'POST',
        body: JSON.stringify({ name, privateKey, passphrase })
    });
};

export const deleteSSHKey = async (id: string) => {
    return apiFetch<{ success: boolean }>(`/keys/${id}`, {
        method: 'DELETE'
    });
};

// ==================== LOCATIONS ====================

export const getLocations = async () => {
    return apiFetch<Location[]>('/locations');
};

export const createLocation = async (location: Omit<Location, 'id'>) => {
    return apiFetch<Location>('/locations', {
        method: 'POST',
        body: JSON.stringify(location)
    });
};

export const updateLocation = async (id: string, location: Partial<Location>) => {
    return apiFetch<Location>(`/locations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(location)
    });
};

export const deleteLocation = async (id: string) => {
    return apiFetch<{ success: boolean }>(`/locations/${id}`, {
        method: 'DELETE'
    });
};

// ==================== JOBS ====================

export const getJobs = async () => {
    return apiFetch<BackupJob[]>('/jobs');
};

export const runJob = async (id: string, options: { privateKey?: string; passphrase?: string; password?: string; sshKeyId?: string } = {}) => {
    return apiFetch<{ success: boolean; job: BackupJob; stats: any; logs: any[] }>(`/jobs/${id}/run`, {
        method: 'POST',
        body: JSON.stringify(options)
    });
};

export const createJob = async (job: Omit<BackupJob, 'id'>) => {
    return apiFetch<BackupJob>('/jobs', {
        method: 'POST',
        body: JSON.stringify(job)
    });
};

export const updateJob = async (id: string, job: Partial<BackupJob>) => {
    return apiFetch<BackupJob>(`/jobs/${id}`, {
        method: 'PUT',
        body: JSON.stringify(job)
    });
};

export const deleteJob = async (id: string) => {
    return apiFetch<{ success: boolean }>(`/jobs/${id}`, {
        method: 'DELETE'
    });
};
