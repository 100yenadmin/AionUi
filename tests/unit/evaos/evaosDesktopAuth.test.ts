/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvaosBrokerSessionClient } from '@/process/services/evaosBrokerSession';
import { beginEvaosDesktopAuth, stopEvaosDesktopAuthLoopback } from '@/process/services/evaosDesktopAuth';

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(async () => undefined),
  },
}));

describe('beginEvaosDesktopAuth', () => {
  afterEach(() => {
    stopEvaosDesktopAuthLoopback();
    vi.clearAllMocks();
  });

  it('opens the ElectricSheep desktop-auth page and imports the loopback callback in main process', async () => {
    const importCallback = vi.fn(() => ({
      state: 'authenticated',
      authenticated: true,
      expired: false,
      source: 'callback',
      message: 'evaOS desktop session is active.',
    }));
    const client = {
      importDesktopSessionFromCallbackUrl: importCallback,
    } as unknown as EvaosBrokerSessionClient;
    const openedUrls: string[] = [];

    const handoff = await beginEvaosDesktopAuth(client, {
      dashboardBaseUrl: 'https://www.electricsheephq.com',
      openExternal: async (url) => {
        openedUrls.push(url);
      },
      timeoutMs: 5000,
    });

    expect(openedUrls).toEqual([handoff.authUrl]);
    const authUrl = new URL(handoff.authUrl);
    expect(authUrl.origin).toBe('https://www.electricsheephq.com');
    expect(authUrl.pathname).toBe('/desktop-auth');
    expect(authUrl.searchParams.get('desktop_app')).toBe('1');
    expect(authUrl.searchParams.get('fresh')).toBe(handoff.fallbackDeviceCode);
    expect(authUrl.searchParams.get('desktop_callback')).toBe(handoff.callbackUrl);
    expect(handoff.callbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    expect(JSON.stringify(handoff)).not.toMatch(/eds_|desktop_session|access_token|Bearer/i);

    const callbackUrl = new URL(handoff.callbackUrl);
    callbackUrl.searchParams.set('desktop_session', 'eds_loopback_session_secret_for_test');
    callbackUrl.searchParams.set('desktop_session_expires_at', '2026-06-03T16:00:00.000Z');
    const response = await fetch(callbackUrl);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('connected');
    expect(importCallback).toHaveBeenCalledTimes(1);
    expect(importCallback).toHaveBeenCalledWith(callbackUrl.toString());
  });
});
