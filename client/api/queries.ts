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
            const res = await fetch('http://localhost:9001/api/status');
            if (!res.ok) throw new Error('Backend not available');
            return res.json();
        }
    });
}

export function usePublicConfig() {
    return useQuery({
        queryKey: queryKeys.config,
        queryFn: async () => {
            const res = await fetch('http://localhost:9001/api/config/public');
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
            const { data } = await API.getSystems();
            return data || [];
        }
    });
}

export function useJobs() {
    return useQuery({
        queryKey: queryKeys.jobs,
        queryFn: async () => {
            const { data } = await API.getJobs();
            return data || [];
        }
    });
}

export function useLocations() {
    return useQuery({
        queryKey: queryKeys.locations,
        queryFn: async () => {
            const { data } = await API.getLocations();
            return data || [];
        }
    });
}

export function useSSHKeys() {
    return useQuery({
        queryKey: queryKeys.sshKeys,
        queryFn: async () => {
            const { data } = await API.getSSHKeys();
            return data || [];
        }
    });
}
