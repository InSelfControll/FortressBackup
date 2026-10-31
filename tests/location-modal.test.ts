import React from 'react';
import { afterAll, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Location } from '../types.ts';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null },
});

const modal = await import('../components/locations/LocationModal.tsx') as any;
const LocationModal = modal.LocationModal;

afterAll(() => {
  if (originalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

const HOST_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINb3o4m8E7d1+Nh4V2m3zF6nY7sR4r7yYh6m4fK3M2bV';

const renderLocation = (location: Location | null) => renderToStaticMarkup(
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    React.createElement(LocationModal, { location, isOpen: true, onClose: () => {} }),
  ),
);

test('loads the SFTP host public key from the server representation', () => {
  const location = {
    id: 'dummy-sftp-id',
    name: 'Dummy SFTP',
    type: 'sftp',
    path: '/backups',
    endpoint: 'backup.example.invalid',
    region: '22',
    host_public_key: HOST_PUBLIC_KEY,
  } as Location & { host_public_key: string };

  const html = renderLocation(location);

  expect(html).toContain('Host Public Key');
  expect(html).toContain(`>${HOST_PUBLIC_KEY}</textarea>`);
  expect(html).toContain('value="backup.example.invalid"');
});

test('maps SFTP connection fields and credentials into the server payload', () => {
  expect(typeof modal.buildLocationData).toBe('function');

  const payload = modal.buildLocationData({
    name: 'Dummy SFTP',
    type: 'sftp',
    path: '/backups',
    endpoint: 'backup.example.invalid',
    region: '2222',
    accessKey: 'dummy-user',
    secretKey: 'dummy-password',
    hostPublicKey: HOST_PUBLIC_KEY,
  }, false, 'dummy-sftp-id');

  expect(payload).toEqual({
    id: 'dummy-sftp-id',
    name: 'Dummy SFTP',
    type: 'sftp',
    path: 'sftp://dummy-user@backup.example.invalid:2222/backups',
    endpoint: 'backup.example.invalid',
    region: '2222',
    access_key: 'dummy-user',
    secret_key: 'dummy-password',
    host_public_key: HOST_PUBLIC_KEY,
  });
});

test('new location payloads leave ID generation to the server on HTTP origins', () => {
  const payload = modal.buildLocationData({
    name: 'Storage Box',
    type: 'sftp',
    path: 'backups/server1',
    endpoint: 'u123456.your-storagebox.de',
    region: '23',
    accessKey: 'u123456',
    hostPublicKey: HOST_PUBLIC_KEY,
  }, false);

  expect(payload).not.toHaveProperty('id');
  expect(payload.path).toBe('sftp://u123456@u123456.your-storagebox.de:23/backups/server1');
});

test('loads a persisted SFTP target as editable connection fields', () => {
  const state = modal.getLocationFormState({
    id: 'dummy-sftp-id',
    name: 'Dummy SFTP',
    type: 'sftp',
    path: 'sftp://dummy-user@backup.example.invalid:2222/backups',
    endpoint: 'backup.example.invalid',
    region: '2222',
    accessKey: 'dummy-user',
    host_public_key: HOST_PUBLIC_KEY,
  });

  expect(state).toMatchObject({
    path: '/backups',
    endpoint: 'backup.example.invalid',
    region: '2222',
    accessKey: 'dummy-user',
    hostPublicKey: HOST_PUBLIC_KEY,
  });
});

test('identifies the SFTP credential as a private key and rejects password messaging', () => {
  const html = renderLocation({
    id: 'dummy-sftp-id',
    name: 'Dummy SFTP',
    type: 'sftp',
    path: '/backups',
    endpoint: 'backup.example.invalid',
    hostPublicKey: HOST_PUBLIC_KEY,
  } as Location);

  expect(html).toContain('SSH Private Key');
  expect(html).toContain('Restic requires an SSH private key. Password-only authentication is not supported.');
  expect(html).not.toContain('Password / Key');
  expect(html).not.toContain('Use SSH key or password');
});

test('requires a host public key for SFTP submission', () => {
  expect(typeof modal.canSubmitLocation).toBe('function');

  expect(modal.canSubmitLocation({
    name: 'Dummy SFTP', type: 'sftp', path: '/backups', hostPublicKey: '   ',
  })).toBe(false);
  expect(modal.canSubmitLocation({
    name: 'Dummy SFTP', type: 'sftp', path: '/backups', hostPublicKey: HOST_PUBLIC_KEY,
  })).toBe(true);
});

test('does not require or submit a host public key for other location types', () => {
  expect(typeof modal.canSubmitLocation).toBe('function');
  expect(typeof modal.buildLocationData).toBe('function');

  for (const type of ['s3', 'nfs', 'b2', 'gcs', 'azure', 'gdrive', 'onedrive']) {
    expect(modal.canSubmitLocation({ name: 'Dummy location', type, path: '/backups' })).toBe(true);
  }

  const payload = modal.buildLocationData({
    name: 'Dummy NFS', type: 'nfs', path: '/backups', hostPublicKey: HOST_PUBLIC_KEY,
  }, false, 'dummy-nfs-id');
  expect(payload.host_public_key).toBeUndefined();
});
