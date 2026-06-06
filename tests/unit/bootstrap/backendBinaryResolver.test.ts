/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveBinaryPath } from '../../../packages/desktop/src/process/backend/binaryResolver';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
const originalBundledDir = process.env.AIONUI_BACKEND_BUNDLED_DIR;

function setResourcesPath(resourcesPath: string | undefined): void {
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: resourcesPath,
  });
}

function dirEntry(name: string, isDirectory = false): ReturnType<typeof readdirSync>[number] {
  return {
    name,
    isDirectory: () => isDirectory,
  } as unknown as ReturnType<typeof readdirSync>[number];
}

describe('resolveBinaryPath bundled resources override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setResourcesPath(originalResourcesPath);
    if (originalBundledDir === undefined) {
      delete process.env.AIONUI_BACKEND_BUNDLED_DIR;
    } else {
      process.env.AIONUI_BACKEND_BUNDLED_DIR = originalBundledDir;
    }
  });

  it('resolves a bundled binary from an explicit resources override before Electron helper resources', () => {
    const resourcesPath = '/repo/resources';
    const bundledDir = join(resourcesPath, 'bundled-aioncore');
    const runtimeKey = `${process.platform}-${process.arch}`;
    const binaryName = process.platform === 'win32' ? 'aioncore.exe' : 'aioncore';
    const runtimeDir = join(bundledDir, runtimeKey);
    const checkedBundledPath = join(runtimeDir, binaryName);

    setResourcesPath('/electron/helper/resources');
    process.env.AIONUI_BACKEND_BUNDLED_DIR = bundledDir;
    vi.mocked(existsSync).mockImplementation((path) => path === checkedBundledPath);
    vi.mocked(readdirSync).mockImplementation((path) => {
      if (path === resourcesPath) return [dirEntry('bundled-aioncore', true)];
      if (path === runtimeDir) return [dirEntry(binaryName), dirEntry('managed-resources', true)];
      return [] as ReturnType<typeof readdirSync>;
    });

    expect(resolveBinaryPath()).toBe(checkedBundledPath);
    expect(execSync).not.toHaveBeenCalled();
  });
});
