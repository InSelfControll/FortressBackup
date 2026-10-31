import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const installer = readFileSync(new URL('../agent/windows/install-task.ps1', import.meta.url), 'utf8');
const windowsWorkflow = Bun.YAML.parse(
  readFileSync(new URL('../.github/workflows/windows-agent.yml', import.meta.url), 'utf8'),
) as any;
const controllerWorkflow = Bun.YAML.parse(
  readFileSync(new URL('../.github/workflows/fortress-controller.yml', import.meta.url), 'utf8'),
) as any;

function step(job: any, name: string) {
  const result = job.steps.find((candidate: any) => candidate.name === name);
  expect(result, `Missing workflow step: ${name}`).toBeDefined();
  return result;
}

test('installer replaces complete security descriptors on every installation object', () => {
  expect(installer).toContain('SetSecurityDescriptorSddlForm');
  expect(installer).toContain('O:BAG:BAD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)');
  expect(installer).toContain('O:BAG:BAD:PAI(A;;FA;;;SY)(A;;FA;;;BA)');
  expect(installer).toContain('Set-ProtectedSecurityDescriptor -Path $root -Directory');
  expect(installer).toContain('Set-ProtectedSecurityDescriptor -Path $destination');
  expect(installer).toContain('Set-ProtectedSecurityDescriptor -Path $stagedConfig');
});

test('installer stages and verifies both executables before replacing live files', () => {
  const stagedAgentCopy = installer.indexOf('Copy-Protected $sourceAgent $stagedAgent');
  const stagedResticCopy = installer.indexOf('Copy-Protected $resticSource $stagedRestic');
  const stagedAgentCheck = installer.indexOf('Assert-FileDigest -Path $stagedAgent');
  const stagedResticCheck = installer.indexOf('Assert-FileDigest -Path $stagedRestic');
  const commit = installer.indexOf('$existingTask=Get-ScheduledTask');

  expect(stagedAgentCopy).toBeGreaterThan(-1);
  expect(stagedResticCopy).toBeGreaterThan(stagedAgentCopy);
  expect(stagedAgentCheck).toBeGreaterThan(stagedResticCopy);
  expect(stagedResticCheck).toBeGreaterThan(stagedAgentCheck);
  expect(commit).toBeGreaterThan(stagedResticCheck);
  expect(installer).not.toContain('Copy-Protected $sourceAgent $agent\n');
  expect(installer).not.toContain('Copy-Protected $resticSource $restic\n');
});

test('installer rolls back replaced files and the previous task when commit fails', () => {
  const commit = installer.indexOf('$existingTask=Get-ScheduledTask');
  const rollback = installer.indexOf('catch{', commit);

  expect(commit).toBeGreaterThan(-1);
  expect(rollback).toBeGreaterThan(commit);
  expect(installer.slice(commit, rollback)).toContain('Export-ScheduledTask');
  expect(installer.slice(commit, rollback)).toContain('Move-Item -LiteralPath $destination -Destination $backup');
  expect(installer.slice(commit, rollback)).toContain('Move-Item -LiteralPath $staged -Destination $destination');
  expect(installer.slice(rollback)).toContain('Move-Item -LiteralPath $backup -Destination $destination');
  expect(installer.slice(rollback)).toContain('Register-ScheduledTask -TaskName $TaskName -Xml $existingTaskXml -Force');
});

test('Windows artifact publication finishes before mutable verification tools run in another job', () => {
  const build = windowsWorkflow.jobs.build;
  const verify = windowsWorkflow.jobs.verify;
  expect(build).toBeDefined();
  expect(verify).toBeDefined();
  expect(verify.needs).toBe('build');

  const buildSteps = build.steps.map((candidate: any) => candidate.run ?? '');
  expect(buildSteps.join('\n')).not.toContain('choco install');
  expect(buildSteps.join('\n')).not.toContain('self-update');
  expect(build.steps.at(-1).uses).toStartWith('actions/upload-artifact@');
  expect(build.steps.at(-1).if).toBe("github.event_name == 'push'");
  expect(build.steps.at(-1).with.path).toContain('fortress-agent.exe.sha256');

  const verifySteps = verify.steps.map((candidate: any) => candidate.run ?? '');
  expect(verifySteps.join('\n')).toContain('choco install restic');
  expect(verify.steps.some((candidate: any) => candidate.uses?.startsWith('actions/upload-artifact@'))).toBe(false);
});

test('Windows CI exercises digest rollback and hostile pre-existing ACLs', () => {
  const check = step(windowsWorkflow.jobs.verify, 'Verify upgrade rollback and protected ACLs').run;
  expect(check).toContain('Export-ScheduledTask');
  expect(check).toContain("$beforeHash=(Get-FileHash -LiteralPath $installedAgent -Algorithm SHA256).Hash");
  expect(check).toContain("'0' * 64");
  expect(check).toContain('Upgrade with a mismatched digest unexpectedly succeeded');
  expect(check).toContain('Live agent changed after a rejected upgrade');
  expect(check).toContain('Scheduled task changed after a rejected upgrade');
  expect(check).toContain('(A;OICI;FA;;;WD)');
  expect(check).toContain('Hostile ACL survived successful upgrade');
});

test('controller CI runs every Bun regression suite', () => {
  const regression = step(controllerWorkflow.jobs.build, 'Bun regression tests');
  expect(regression.run).toBe('bun test');
});

test('controller CI triggers cover all tested and built source paths', () => {
  const required = [
    'agent/**',
    'tests/**',
    'scripts/**',
    'src/**',
    'landing/**',
    'index.tsx',
    'index.html',
    'global.css',
    'vite.config.ts',
    'tsconfig.json',
    'tailwind.config.js',
    'postcss.config.js',
    'Dockerfile',
    '.github/workflows/windows-agent.yml',
    '.github/workflows/release.yml',
  ];

  for (const event of ['push', 'pull_request']) {
    expect(controllerWorkflow.on[event].paths).toEqual(expect.arrayContaining(required));
  }
});

test('release publication waits for validation and verifies bundled executables', () => {
  const release = Bun.YAML.parse(readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')) as any;
  expect(windowsWorkflow.on).toHaveProperty('workflow_call');
  expect(release.jobs.windows.uses).toBe('./.github/workflows/windows-agent.yml');
  expect(release.jobs['package-windows'].needs).toBe('windows');
  expect(release.jobs.publish.needs).toEqual(['controller', 'package-windows']);
  const packaging = step(release.jobs['package-windows'], 'Assemble Windows x64 download');
  expect(packaging.env.RESTIC_ZIP_SHA256).toMatch(/^[a-f0-9]{64}$/);
  expect(packaging.run.indexOf('Restic download checksum mismatch')).toBeLessThan(packaging.run.indexOf('Expand-Archive'));
  expect(packaging.run).toContain('Agent artifact checksum mismatch');
  expect(packaging.run).toContain('RESTIC-LICENSE.txt');
  expect(packaging.run).toContain('Install FortressBackup.cmd');
  expect(packaging.run).toContain('setup.ps1');
  expect(step(windowsWorkflow.jobs.verify, 'Verify setup with Windows PowerShell 5.1').shell).toBe('powershell');
  expect(step(release.jobs.controller, 'Require a version tag on main').run).toContain('git merge-base --is-ancestor HEAD origin/main');
});
