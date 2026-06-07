/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import type {
  IEvaosNativeCompanionOpenResult,
  IEvaosNativeCompanionPermissionView,
  IEvaosNativeCompanionStatusView,
} from '@/common/evaos/bridgeTypes';

const execFileAsync = promisify(execFileCallback);

const DEFAULT_BRIDGE_PATHS = ['/opt/homebrew/bin/evaos-desktop-bridge', '/usr/local/bin/evaos-desktop-bridge'];
const DEFAULT_RELEASED_WORKBENCH_PATH = '/Applications/evaOS.app';
const COMMAND_TIMEOUT_MS = 8000;

type ExecFileResult = {
  stdout: string;
  stderr: string;
};

export type EvaosNativeCompanionStatusDeps = {
  now?: () => Date;
  bridgePaths?: string[];
  releasedWorkbenchPath?: string;
  existsSync?: (path: string) => boolean;
  execFile?: (file: string, args: string[], options: { timeout: number }) => Promise<ExecFileResult>;
  openPath?: (path: string) => Promise<string>;
};

type BridgePayload = {
  ok?: boolean;
  audit_id?: string;
  data?: Record<string, unknown>;
  errors?: Array<Record<string, unknown>>;
};

export async function getEvaosNativeCompanionStatus(
  deps: EvaosNativeCompanionStatusDeps = {}
): Promise<IEvaosNativeCompanionStatusView> {
  const now = deps.now ?? (() => new Date());
  const existsSync = deps.existsSync ?? fs.existsSync;
  const bridgePath = resolveBridgeExecutable(deps.bridgePaths ?? DEFAULT_BRIDGE_PATHS, existsSync);
  const releasedWorkbenchPath = deps.releasedWorkbenchPath ?? DEFAULT_RELEASED_WORKBENCH_PATH;
  const releasedWorkbenchInstalled = existsSync(releasedWorkbenchPath);
  const generatedAt = now().toISOString();

  if (!bridgePath) {
    return {
      schemaVersion: 'evaos.native_companion_status.v1',
      generatedAt,
      readiness: 'repair_required',
      summaryText: 'Bridge CLI is not installed. Open the released evaOS Workbench fallback to repair Mac pairing.',
      sourcePointer: 'native-companion:bridge-cli-missing',
      canOpenReleasedWorkbench: releasedWorkbenchInstalled,
      releasedWorkbench: {
        installed: releasedWorkbenchInstalled,
        path: releasedWorkbenchInstalled ? releasedWorkbenchPath : undefined,
      },
      bridgeCli: {
        installed: false,
        status: 'missing',
        readOnly: true,
      },
      customerMac: { status: 'unavailable' },
      iPhone: { status: 'unavailable' },
      audit: { status: 'unavailable', auditIds: [] },
    };
  }

  const [bridge, customerMac, iPhone, audit] = await Promise.all([
    runBridgeCommand(bridgePath, ['status', '--json'], deps),
    runBridgeCommand(bridgePath, ['customer-mac', 'status', '--json'], deps),
    runBridgeCommand(bridgePath, ['customer-mac', 'iphone-mirroring', 'status', '--json'], deps),
    runBridgeCommand(bridgePath, ['audit-tail', '--json', '--limit', '5'], deps),
  ]);

  const bridgePermissions = permissionView(bridge.data?.permissions);
  const customerMacPermissions = permissionView(customerMac.data?.permissions);
  const bridgeReady = bridge.ok && hasGrantedCorePermissions(bridgePermissions);
  const customerMacReady = customerMac.ok && hasGrantedCorePermissions(customerMacPermissions);
  const readiness = bridgeReady && customerMacReady ? 'ready' : 'repair_required';
  const auditIds = auditIdsFromPayload(audit);

  return {
    schemaVersion: 'evaos.native_companion_status.v1',
    generatedAt,
    readiness,
    summaryText:
      readiness === 'ready'
        ? 'Native companion ready from read-only bridge proof.'
        : 'Native companion repair is required before evaOS or Hermes can use Mac control.',
    sourcePointer: 'native-companion:read-only-bridge',
    canOpenReleasedWorkbench: releasedWorkbenchInstalled,
    releasedWorkbench: {
      installed: releasedWorkbenchInstalled,
      path: releasedWorkbenchInstalled ? releasedWorkbenchPath : undefined,
    },
    bridgeCli: {
      installed: true,
      status: bridgeReady ? 'ready' : bridge.ok ? 'repair_required' : 'error',
      path: bridgePath,
      auditId: bridge.auditId,
      permissions: bridgePermissions,
      readOnly: readBoolean(bridge.data?.safety, 'read_only') !== false,
    },
    customerMac: {
      status: customerMacReady ? 'ready' : customerMac.ok ? 'repair_required' : 'error',
      auditId: customerMac.auditId,
      deviceLabel: readNestedString(customerMac.data, ['device', 'hostname']),
      permissions: customerMacPermissions,
      screenSharing: screenSharingSummary(customerMac.data?.screen_sharing),
      killSwitchAvailable: readBoolean(customerMac.data?.safety, 'kill_switch_available'),
      appendOnlyAuditLog: readBoolean(customerMac.data?.safety, 'append_only_audit_log'),
    },
    iPhone: {
      status: iPhone.ok ? 'available' : 'unavailable',
      auditId: iPhone.auditId,
      installed: readBoolean(iPhone.data, 'installed'),
      running: readBoolean(iPhone.data, 'running'),
      killSwitchAvailable: readBoolean(iPhone.data?.safety, 'kill_switch_available'),
    },
    audit: {
      status: audit.ok ? 'ready' : 'unavailable',
      auditIds,
      latestAuditId: auditIds[0],
    },
  };
}

export async function openReleasedEvaosWorkbench(
  deps: EvaosNativeCompanionStatusDeps = {}
): Promise<IEvaosNativeCompanionOpenResult> {
  const releasedWorkbenchPath = deps.releasedWorkbenchPath ?? DEFAULT_RELEASED_WORKBENCH_PATH;
  const existsSync = deps.existsSync ?? fs.existsSync;
  if (!existsSync(releasedWorkbenchPath)) {
    return {
      opened: false,
      message: 'Released evaOS Workbench fallback is not installed.',
    };
  }

  const openPath = deps.openPath ?? defaultOpenPath;
  const error = await openPath(releasedWorkbenchPath);
  if (error) {
    return {
      opened: false,
      path: releasedWorkbenchPath,
      message: error,
    };
  }

  return {
    opened: true,
    path: releasedWorkbenchPath,
    message: 'Opened released evaOS Workbench for native pairing and repair.',
  };
}

function resolveBridgeExecutable(paths: string[], existsSync: (path: string) => boolean): string | undefined {
  return paths.find((path) => existsSync(path));
}

async function runBridgeCommand(
  bridgePath: string,
  args: string[],
  deps: EvaosNativeCompanionStatusDeps
): Promise<{ ok: boolean; auditId?: string; data?: Record<string, unknown> }> {
  const execFile = deps.execFile ?? defaultExecFile;
  try {
    const completed = await execFile(bridgePath, args, { timeout: COMMAND_TIMEOUT_MS });
    const payload = JSON.parse(completed.stdout || '{}') as BridgePayload;
    return {
      ok: payload.ok === true,
      auditId: typeof payload.audit_id === 'string' ? payload.audit_id : undefined,
      data: payload.data && typeof payload.data === 'object' ? payload.data : undefined,
    };
  } catch {
    return { ok: false };
  }
}

async function defaultExecFile(file: string, args: string[], options: { timeout: number }): Promise<ExecFileResult> {
  const result = await execFileAsync(file, args, {
    timeout: options.timeout,
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

async function defaultOpenPath(path: string): Promise<string> {
  const { shell } = await import('electron');
  return shell.openPath(path);
}

function permissionView(input: unknown): IEvaosNativeCompanionPermissionView | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  return {
    accessibility: readNestedString(record, ['accessibility', 'status']),
    screenRecording: readNestedString(record, ['screen_recording', 'status']),
  };
}

function hasGrantedCorePermissions(permissions: IEvaosNativeCompanionPermissionView | undefined): boolean {
  return permissions?.accessibility === 'granted' && permissions.screenRecording === 'granted';
}

function screenSharingSummary(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const enabled = readBoolean(input, 'enabled');
  const vncListening = readBoolean(input, 'vnc_5900_listening');
  if (enabled === undefined && vncListening === undefined) return undefined;
  return `enabled=${String(enabled ?? false)}; vnc_5900_listening=${String(vncListening ?? false)}`;
}

function auditIdsFromPayload(payload: { data?: Record<string, unknown> }): string[] {
  const records = payload.data?.records;
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => (record && typeof record === 'object' ? (record as Record<string, unknown>).audit_id : undefined))
    .filter((auditId): auditId is string => typeof auditId === 'string' && auditId.trim().length > 0);
}

function readBoolean(input: unknown, key: string): boolean | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readNestedString(input: unknown, path: string[]): string | undefined {
  let current = input;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim() ? current.trim() : undefined;
}
