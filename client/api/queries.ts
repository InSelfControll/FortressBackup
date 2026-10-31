import { requireData } from './client.js';
import { useQuery } from '@tanstack/react-query';
import * as API from './resources.js';
import * as Health from './health.js';
import * as Auth from './auth.js';

// Keys
export const queryKeys = {
    status: ['system', 'status'],
    config: ['config', 'public'],
    systems: ['systems'],
    jobs: ['jobs'],
    locations: ['locations'],
    sshKeys: ['sshKeys'],
};

// Hooks

export function useSystemStatus() {
    return useQuery({
        queryKey: queryKeys.status,
        queryFn: async () => {
            const res = await fetch('/api/status');
            if (!res.ok) throw new Error('Backend not available');
            return res.json();
        }
    });
}

export function usePublicConfig() {
    return useQuery({
        queryKey: queryKeys.config,
        queryFn: async () => {
            const res = await fetch('/api/config/public');
            if (!res.ok) throw new Error('Could not load public config');
            return res.json();
        },
        retry: 0
    });
}

export function useSystems() {
    return useQuery({
        queryKey: queryKeys.systems,
        queryFn: async () => {
            return requireData(await API.getSystems());
        }
    });
}

export function useJobs() {
    return useQuery({
        queryKey: queryKeys.jobs,
        refetchInterval: 5000,
        queryFn: async () => {
            return requireData(await API.getJobs());
        }
    });
}

export function useLocations() {
    return useQuery({
        queryKey: queryKeys.locations,
        queryFn: async () => {
            return requireData(await API.getLocations());
        }
    });
}

export function useSSHKeys() {
    return useQuery({
        queryKey: queryKeys.sshKeys,
        queryFn: async () => {
            return requireData(await API.getSSHKeys());
        }
    });
}
