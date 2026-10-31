import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectOS, installRestic } from '../server/services/ssh/tools.ts';
import type { SSHExecutor } from '../server/services/ssh/types.ts';

test('deployment detects quoted distribution IDs and compatible families', async () => {
    for (const [release, expected] of [
        ['ID="rocky"\nID_LIKE="rhel centos fedora"', 'dnf'],
        ['ID="almalinux"\nID_LIKE="rhel centos fedora"', 'dnf'],
        ['ID="debian"', 'apt'],
        ['ID=ubuntu\nID_LIKE=debian', 'apt'],
        ['ID=arch', 'pacman'],
    ]) {
        const executor: SSHExecutor = {
            log() {},
            async executeCommand() { return { stdout: release, stderr: '', code: 0 }; },
        };
        expect((await detectOS(executor)).packageManager).toBe(expected);
    }
});

test('Restic deployment supports distro builds and still rejects updater failures', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-restic-deploy-'));
    try {
        for (const [helpExit, updateExit, expected] of [[1, 99, true], [0, 0, true], [0, 1, false]] as const) {
            fs.writeFileSync(path.join(dir, 'restic'), `#!/bin/sh
case "$1 $2" in
    'self-update --help') exit ${helpExit} ;;
    'self-update --output') exit ${updateExit} ;;
    'version ') echo 'restic 0.19.1'; exit 0 ;;
    *) exit 99 ;;
esac
`, { mode: 0o700 });
            const executor: SSHExecutor = {
                log() {},
                async executeCommand(command) {
                    const result = Bun.spawnSync(['sh', '-c', command], {
                        env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
                    });
                    return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), code: result.exitCode };
                },
            };
            expect(await installRestic(executor)).toBe(expected);
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
