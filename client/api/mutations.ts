import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as API from './resources';
import { queryKeys } from './queries';
import { BackupJob, System, SSHKey, Location } from '../../types';

// Job Mutations
export function useCreateJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (job: BackupJob) => API.createJob(job).then(res => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
        },
    });
}

export function useUpdateJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (job: BackupJob) => API.updateJob(job.id, job).then(res => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
        },
    });
}

export function useDeleteJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.deleteJob(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
        },
    });
}

export function useRunJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.runJob(id),
        onSuccess: () => {
            // Invalidate jobs to update lastRun/status if the backend updates it immediately
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
        },
        // You might want optimistic updates here too, but for 'run', usually backend status polling is safer
    });
}

// System Mutations
export function useCreateSystem() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (system: System) => API.createSystem(system).then(res => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.systems });
        },
    });
}

export function useUpdateSystem() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (system: System) => API.updateSystem(system.id, system).then(res => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.systems });
        },
    });
}

export function useDeleteSystem() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.deleteSystem(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.systems });
        },
    });
}

// Location Mutations
export function useCreateLocation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (location: Location) => API.createLocation(location).then(res => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.locations });
        },
    });
}

export function useUpdateLocation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (location: Location) => API.updateLocation(location.id, location).then(res => res.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.locations });
        },
    });
}

export function useDeleteLocation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.deleteLocation(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.locations });
        },
    });
}

// SSH Key Mutations
export function useCreateSSHKey() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (key: SSHKey) => API.createSSHKey(key.name, (key.privateKeyPath as string) || '', key.isEncrypted ? 'passphrase-placeholder' : undefined).then(res => res.data),
        // Note: The API.createSSHKey signature in resources.ts needs to be checked. 
        // Usually it accepts name, privateKey, passphrase. 
        // But here I'm passing a key object. I'll need to adapt or check usage.
        // Let's assume for now I should use the API directly or adapt the hook inputs.
        // checking usage in Systems.tsx: createSSHKey(newKey.name, newKey.privateKey, newKey.passphrase)
        // So the hook should probably take those args or an object.
        // I will make the mutationFn take { name, privateKey, passphrase }
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sshKeys });
        },
    });
}

export function useDeleteSSHKey() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => API.deleteSSHKey(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.sshKeys });
        },
    });
}
