import { expect, test } from 'bun:test';

const modal = await import('../components/RestoreModal.tsx') as any;

const restoreInput = {
  snapshotId: 'snapshot-1',
  restorePath: '/tmp/restore',
  systemId: 'system-1',
  selectedFiles: [],
};

test('sends an explicit empty selection for a zero-selection specific restore', () => {
  const payload = modal.buildRestorePayload?.({
    ...restoreInput,
    fileSelectionMode: 'specific',
  });

  expect(payload).toEqual({
    snapshotId: 'snapshot-1',
    restorePath: '/tmp/restore',
    systemId: 'system-1',
    paths: [],
  });
});

test('omits the selection field for an all-files restore', () => {
  const payload = modal.buildRestorePayload?.({
    ...restoreInput,
    fileSelectionMode: 'all',
  });

  expect(payload).toEqual({
    snapshotId: 'snapshot-1',
    restorePath: '/tmp/restore',
    systemId: 'system-1',
  });
  expect(Object.hasOwn(payload, 'paths')).toBe(false);
});

test('preserves nonempty specific-file selections', () => {
  const payload = modal.buildRestorePayload?.({
    ...restoreInput,
    fileSelectionMode: 'specific',
    selectedFiles: ['etc/hosts', 'var/www/index.html'],
  });

  expect(payload.paths).toEqual(['etc/hosts', 'var/www/index.html']);
});

test('disables Start Restore when specific mode has zero selections', () => {
  expect(modal.canStartRestore?.('/tmp/restore', 'specific', [])).toBe(false);
});

test('allows Start Restore with a destination and a valid selection mode', () => {
  expect(modal.canStartRestore?.('/tmp/restore', 'all', [])).toBe(true);
  expect(modal.canStartRestore?.('/tmp/restore', 'specific', ['etc/hosts'])).toBe(true);
  expect(modal.canStartRestore?.('', 'all', [])).toBe(false);
});

test('does not offer root as an original-path restore destination', () => {
  expect(modal.canStartRestore?.('/', 'all', [])).toBe(false);
});
