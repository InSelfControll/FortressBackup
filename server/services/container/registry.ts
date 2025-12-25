/**
 * Container Registry Service
 * Handles detection and management of Docker/Container runtimes.
 */

import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export interface ContainerInfo {
    id: string;
    names: string[];
    image: string;
    state: string;
    labels: Record<string, string>;
    mounts: { source: string; destination: string; type: string }[];
}

export class ContainerRegistry {
    private isDockerAvailable: boolean = false;

    constructor() {
        this.checkAvailability();
    }

    /**
     * Check if Docker runtime is available via shell command
     */
    async checkAvailability(): Promise<boolean> {
        try {
            await execAsync('docker --version');
            this.isDockerAvailable = true;
            return true;
        } catch {
            this.isDockerAvailable = false;
            return false;
        }
    }

    /**
     * List running containers (formatted)
     */
    async listContainers(): Promise<ContainerInfo[]> {
        if (!this.isDockerAvailable) {
            // Re-check or return empty
            const available = await this.checkAvailability();
            if (!available) return [];
        }

        try {
            // Helper format to get JSON extraction from docker ps
            const { stdout } = await execAsync('docker ps --format "{{json .}}"');
            const lines = stdout.trim().split('\n');

            return lines.map(line => {
                try {
                    const raw = JSON.parse(line);
                    // Map raw docker output to ContainerInfo
                    return {
                        id: raw.ID,
                        names: raw.Names ? raw.Names.split(',') : [],
                        image: raw.Image,
                        state: raw.State,
                        labels: {}, // labels need specific formatting in ps command to parse easily, skipped for basic scaffold
                        mounts: []  // inspect needed for mounts
                    };
                } catch {
                    return null;
                }
            }).filter(Boolean) as ContainerInfo[];

        } catch (error) {
            console.error('Failed to list containers:', error);
            return [];
        }
    }

    /**
     * Inspect a specific container to get volumes/mounts
     */
    async inspectContainer(id: string): Promise<ContainerInfo | null> {
        if (!this.isDockerAvailable) return null;

        try {
            const { stdout } = await execAsync(`docker inspect ${id}`);
            const data = JSON.parse(stdout)[0];

            return {
                id: data.Id.substring(0, 12),
                names: [data.Name.replace('/', '')],
                image: data.Config.Image,
                state: data.State.Running ? 'running' : 'stopped',
                labels: data.Config.Labels || {},
                mounts: (data.Mounts || []).map((m: any) => ({
                    source: m.Source,
                    destination: m.Destination,
                    type: m.Type
                }))
            };
        } catch (error) {
            console.error(`Failed to inspect container ${id}:`, error);
            return null;
        }
    }
}

export const containerRegistry = new ContainerRegistry();
