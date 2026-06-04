/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import {
  evaosLocalProductFixtureCustomerTargets,
  evaosLocalProductFixtureProviderAction,
  evaosLocalProductFixtureProviderHub,
  isEvaosLocalProductFixtureEnabled,
} from '@/process/services/evaosLocalProductFixture';

const SECRET_PATTERN =
  /\b(?:eds|epg)_[A-Za-z0-9_-]+\b|access[_-]?token|refresh[_-]?token|desktop[_-]?session|provider[_-]?grant|grant[_-]?handle|Bearer|authorization/i;

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return Object.values(value).flatMap(stringValues);
}

describe('evaOS local product fixture', () => {
  it('requires both E2E mode and explicit local product fixture opt-in', () => {
    expect(isEvaosLocalProductFixtureEnabled({ AIONUI_E2E_TEST: '1' })).toBe(false);
    expect(isEvaosLocalProductFixtureEnabled({ AIONUI_EVAOS_LOCAL_PRODUCT_FIXTURE: '1' })).toBe(false);
    expect(isEvaosLocalProductFixtureEnabled({ AIONUI_E2E_TEST: '1', AIONUI_EVAOS_LOCAL_PRODUCT_FIXTURE: '1' })).toBe(
      true
    );
  });

  it('provides loaded customer and provider state proof without secret-shaped values', () => {
    const customers = evaosLocalProductFixtureCustomerTargets();
    const hub = evaosLocalProductFixtureProviderHub({ customerId: 'fixture-customer-acme' });

    expect(customers.summaryText).toContain('LOCAL FIXTURE - NOT LIVE BETA PROOF');
    expect(customers.selectedCustomerId).toBe('fixture-customer-acme');
    expect(hub.summaryText).toContain('LOCAL FIXTURE - NOT LIVE BETA PROOF');
    expect(hub.profiles.map((profile) => profile.status)).toEqual([
      'connected',
      'needs_login',
      'expired',
      'revoked',
      'approval_required',
    ]);
    expect(hub.profiles.find((profile) => profile.providerKey === 'google_workspace')).toMatchObject({
      hasConnectionProof: true,
      hasBrokeredGrant: true,
    });
    expect(stringValues({ customers, hub }).join('\n')).not.toMatch(SECRET_PATTERN);
  });

  it('fails closed for a customer outside the local fixture', () => {
    const hub = evaosLocalProductFixtureProviderHub({ customerId: 'wrong-customer' });

    expect(hub.routeDenied).toBe(true);
    expect(hub.profiles).toEqual([]);
    expect(hub.summaryText).toContain('wrong customer fixture');
  });

  it('returns broker-like provider action evidence without exposing opaque handles', () => {
    const result = evaosLocalProductFixtureProviderAction(
      { customerId: 'fixture-customer-acme', providerKey: 'google_workspace', agentRuntime: 'openclaw' },
      'provider_mint_grant'
    );

    expect(result).toMatchObject({
      status: 'granted',
      providerKey: 'google_workspace',
      backendEnforced: true,
    });
    expect(result.message).toContain('opaque agent access handle minted');
    expect(stringValues(result).join('\n')).not.toMatch(SECRET_PATTERN);
  });
});
