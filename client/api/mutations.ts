import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as API from './resources';
import { queryKeys } from './queries';
import { requireData } from './client';
import { BackupJob, System, Location } from '../../types';

// Job Mutations
export function useCreateJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (job: Omit<BackupJob, 'id'>) => API.createJob(job).then(requireData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
        },
    });
}

export function useUpdateJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (job: BackupJob) => API.updateJob(job.id, job).then(requireData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
        },
    });
}

export function useDeleteJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.deleteJob(id).then(requireData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
        },
    });
}

export function useRunJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.runJob(id).then(requireData),
        onSuccess: () => {
            // Invalidate jobs to update lastRun/status if the backend updates it immediately
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
        },
        onError: () => { queryClient.invalidateQueries({queryKey:queryKeys.jobs}); }
    });
}

// System Mutations
export function useCreateSystem() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (system: Omit<System, 'id'>) => API.createSystem(system).then(requireData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.systems });
        },
    });
}

export function useUpdateSystem() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (system: System) => API.updateSystem(system.id, system).then(requireData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.systems });
        },
    });
}

export function useDeleteSystem() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.deleteSystem(id).then(requireData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.systems });
        },
    });
}

// Location Mutations
export function useCreateLocation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (location: Omit<Location, 'id'>) => {
            const response = await API.createLocation(location);
            if (response.error || !response.data) {
                throw new Error(response.error || 'The server did not return the saved location');
            }
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.locations });
        },
    });
}

export function useUpdateLocation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (location: Location) => {
            const response = await API.updateLocation(location.id, location);
            if (response.error || !response.data) {
                throw new Error(response.error || 'The server did not return the saved location');
            }
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.locations });
        },
    });
}

export function useDeleteLocation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.deleteLocation(id).then(requireData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.locations });
        },
    });
}

// SSH Key Mutations
export function useCreateSSHKey() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (key: { name: string; privateKey: string; passphrase?: string }) =>
            API.createSSHKey(key.name, key.privateKey, key.passphrase).then(requireData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sshKeys });
        },
    });
}

export function useDeleteSSHKey() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.deleteSSHKey(id).then(requireData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sshKeys });
        },
    });
}
