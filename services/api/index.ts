/**
 * API Service - Re-exports all modules
 */

// Client core
export { apiFetch, setToken, getToken, API_BASE } from './client.js';
export type { ApiResponse } from './client.js';

// Auth
export { register, login, githubAuth, getMe, logout } from './auth.js';
export type { AuthUser, AuthResponse } from './auth.js';

// Health & Config
export { checkHealth, getStatus, getConfig, saveConfig, completeSetup, isApiAvailable } from './health.js';
export type { SetupData } from './health.js';

// Resources
export {
    getSystems, createSystem, updateSystem, deleteSystem,
    getSSHKeys, createSSHKey, deleteSSHKey,
    getLocations, createLocation, updateLocation, deleteLocation,
    getJobs, runJob, createJob, updateJob, deleteJob
} from './resources.js';
