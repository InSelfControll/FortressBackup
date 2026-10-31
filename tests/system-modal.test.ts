import React from 'react';
import { afterAll, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type { System } from '../types.ts';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null },
});

const addModal = await import('../components/systems/AddSystemModal.tsx') as any;
const editModal = await import('../components/systems/EditSystemModal.tsx') as any;

afterAll(() => {
  if (originalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

const HOST_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINb3o4m8E7d1+Nh4V2m3zF6nY7sR4r7yYh6m4fK3M2bV';
const OTHER_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HOST_FINGERPRINT = `SHA256:${'A'.repeat(43)}`;

const system = {
  id: 'source-id',
  name: 'Source',
  host: 'source.example.invalid',
  type: 'remote',
  port: 2222,
  username: 'backup',
  status: 'online',
  lastSeen: 'Now',
  health: 100,
  installedTools: [],
  sshKeyId: 'identity-id',
  hostFingerprint: HOST_FINGERPRINT,
  hostPublicKey: HOST_PUBLIC_KEY,
} as System & { hostFingerprint: string };

const renderModal = (component: React.ComponentType<any>, props: object) => renderToStaticMarkup(
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    React.createElement(component, {
      isOpen: true,
      onClose: () => {},
      sshKeys: [],
      ...props,
    }),
  ),
);

test('add system form exposes source host public key enrollment', () => {
  const html = renderModal(addModal.AddSystemModal, {});

  expect(html).toContain('Host Public Key');
  expect(html).toContain('<textarea');
});

test('add system submission carries the host key with the existing enrollment fields', () => {
  expect(typeof addModal.buildSystemData).toBe('function');

  const payload = addModal.buildSystemData({
    name: 'Source',
    host: 'source.example.invalid',
    type: 'remote',
    port: 2222,
    username: 'backup',
    sshKeyId: 'identity-id',
    hostPublicKey: HOST_PUBLIC_KEY,
  }, 'new-source-id');

  expect(payload).toEqual({
    id: 'new-source-id',
    name: 'Source',
    host: 'source.example.invalid',
    type: 'remote',
    port: 2222,
    username: 'backup',
    sshKeyId: 'identity-id',
    hostPublicKey: HOST_PUBLIC_KEY,
    status: 'offline',
    lastSeen: 'Now',
    health: 0,
    installedTools: [],
  });
});

test('edit system form loads the enrolled source host public key', () => {
  const html = renderModal(editModal.EditSystemModal, { system });

  expect(html).toContain('Host Public Key');
  expect(html).toContain(`>${HOST_PUBLIC_KEY}</textarea>`);
  expect(html).toContain('value="source.example.invalid"');
  expect(html).toContain('value="2222"');
});

test('edit system submission clears a stale fingerprint when the host key changes', () => {
  expect(typeof editModal.buildSystemData).toBe('function');

  const payload = editModal.buildSystemData(system, {
    name: 'Renamed source',
    host: system.host,
    type: system.type,
    port: system.port,
    username: system.username,
    sshKeyId: system.sshKeyId,
    hostPublicKey: OTHER_PUBLIC_KEY,
  });

  expect(payload).toEqual({
    ...system,
    name: 'Renamed source',
    hostPublicKey: OTHER_PUBLIC_KEY,
    hostFingerprint: undefined,
  });
});

test('edit system submission preserves the fingerprint when the host key is unchanged', () => {
  const payload = editModal.buildSystemData(system, {
    name: 'Renamed source',
    host: system.host,
    type: system.type,
    port: system.port,
    username: system.username,
    sshKeyId: system.sshKeyId,
    hostPublicKey: HOST_PUBLIC_KEY,
  });

  expect(payload).toEqual({
    ...system,
    name: 'Renamed source',
  });
});


test('HTTP system enrollment uses server IDs and omits an empty optional host key', () => {
  const payload = addModal.buildSystemData({name:'Unverified source',host:'host.example.invalid',hostPublicKey:''});
  expect(payload).not.toHaveProperty('id');
  expect(payload.hostPublicKey).toBeUndefined();
  expect(payload.status).toBe('offline');
  expect(payload.health).toBe(0);
});
