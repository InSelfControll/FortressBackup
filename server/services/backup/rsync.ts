/**
 * Rsync Backup Command Builder
 */

import { BackupJobConfig, SSHConfig } from './types.js';

export const buildRsyncCommand = (config: BackupJobConfig, sshConfig?: SSHConfig, isLocal: boolean = false): string => {
    // If Local (Pull Mode), we need to construct rsync command specific for SSH pull
    if (isLocal && sshConfig) {
        return `rsync -avz --stats --progress --one-file-system --exclude='/mnt' --exclude='/media' --exclude='/run/media' --exclude='/run' --exclude='/proc' --exclude='/sys' --exclude='/dev' -e "ssh -o StrictHostKeyChecking=no -p ${sshConfig.port} -i %%KEYFILE%%" ${config.sourcePaths.map(p => `${sshConfig.username}@${sshConfig.host}:${p}`).join(' ')} ${config.destinationPath}`;
    }

    // Basic rsync backup
    // Basic rsync backup with --one-file-system to prevent recursion
    let cmd = `rsync -avz --stats --progress --one-file-system --exclude='/mnt' --exclude='/media' --exclude='/run/media' --exclude='/run' --exclude='/proc' --exclude='/sys' --exclude='/dev' ${config.sourcePaths.join(' ')} ${config.destinationPath}`;
    return cmd;
};
