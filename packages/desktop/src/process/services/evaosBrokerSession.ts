/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  IEvaosBrokerSessionStatus,
  IEvaosRuntimeKey,
  IEvaosRuntimeStatusRequest,
  IEvaosRuntimeStatusView,
  IEvaosSafeUrlSummary,
} from '@/common/adapter/ipcBridge';

export const EVAOS_DESKTOP_RUNTIME_SESSION_ENDPOINT =
  'https://rhfojelkgtwcxnrfhtlj.supabase.co/functions/v1/desktop-runtime-session';

const VALID_RUNTIME_KEYS: ReadonlySet<IEvaosRuntimeKey> = new Set([
  'openclaw',
  'hermes',
  'paperclip',
  'browser',
  'terminal',
  'opendesign',
  'creative_studio',
]);

const RUNTIME_LABELS: Record<IEvaosRuntimeKey, string> = {
  openclaw: 'OpenClaw',
  hermes: 'Hermes',
  paperclip: 'Paperclip',
  browser: 'Business Browser',
  terminal: 'Terminal',
  opendesign: 'Open Design',
  creative_studio: 'Creative Studio',
};

const SECRET_FIELD_PATTERN =
  /(authorization|bearer|token|secret|password|credential|desktop[_-]?session|access[_-]?token|refresh[_-]?token|api[_-]?key|service[_-]?role|provider[_-]?grant|grant[_-]?handle)/i;
const SECRET_VALUE_PATTERNS = [
  /\beds_[A-Za-z0-9_-]{8,}\b/,
  /\bepg_[A-Za-z0-9_-]{8,}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i,
];
const MAX_SAFE_TEXT_LENGTH = 500;

export type EvaosBrokerErrorCode =
  | 'missing_session'
  | 'expired_session'
  | 'invalid_device_code'
  | 'invalid_customer'
  | 'invalid_runtime'
  | 'broker_http_error'
  | 'broker_invalid_response'
  | 'broker_network_error';

export class EvaosBrokerSessionError extends Error {
  readonly code: EvaosBrokerErrorCode;
  readonly status?: number;

  constructor(code: EvaosBrokerErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'EvaosBrokerSessionError';
    this.code = code;
    this.status = status;
  }
}

export interface EvaosDesktopSession {
  accessToken: string;
  userEmail?: string;
  expiresAt?: string;
  source?: 'environment' | 'memory';
}

export type EvaosBrokerFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface EvaosBrokerSessionClientOptions {
  endpoint?: string;
  fetchImpl?: EvaosBrokerFetch;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

interface DesktopSessionClaimResponse {
  desktop_session?: unknown;
  desktop_session_expires_at?: unknown;
  expires_at?: unknown;
  email?: unknown;
}

let defaultClient: EvaosBrokerSessionClient | null = null;

export class EvaosBrokerSessionClient {
  private readonly endpoint: string;
  private readonly fetchImpl: EvaosBrokerFetch;
  private readonly now: () => Date;
  private session: EvaosDesktopSession | null;

  constructor(options: EvaosBrokerSessionClientOptions = {}) {
    this.endpoint = normalizeEndpoint(options.endpoint ?? process.env.AIONUI_EVAOS_BROKER_ENDPOINT);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.session = loadSessionFromEnvironment(options.env ?? process.env);
  }

  getSessionStatus(): IEvaosBrokerSessionStatus {
    return sessionStatus(this.session, this.now());
  }

  async claimDeviceCode(deviceCode: string): Promise<IEvaosBrokerSessionStatus> {
    const normalizedCode = normalizeDeviceCode(deviceCode);
    if (!normalizedCode) {
      throw new EvaosBrokerSessionError(
        'invalid_device_code',
        'Enter the evaOS device code from the browser sign-in page.'
      );
    }

    const raw = (await this.postJson({
      action: 'claim_desktop_device_code',
      device_code: normalizedCode,
    })) as DesktopSessionClaimResponse;

    const accessToken = safeRawSecret(raw.desktop_session);
    const expiresAt = safeIsoDate(raw.desktop_session_expires_at ?? raw.expires_at);
    if (!accessToken || !expiresAt) {
      throw new EvaosBrokerSessionError(
        'broker_invalid_response',
        'The evaOS broker did not return a usable desktop session.'
      );
    }

    this.session = {
      accessToken,
      userEmail: safeText(raw.email),
      expiresAt,
      source: 'memory',
    };

    return this.getSessionStatus();
  }

  async runtimeStatus(request: IEvaosRuntimeStatusRequest): Promise<IEvaosRuntimeStatusView> {
    const customerId = normalizeRequiredText(
      request.customerId,
      'invalid_customer',
      'Choose a customer before checking runtime status.'
    );
    const runtime = normalizeRuntime(request.runtime);
    const session = this.requireActiveSession();

    const raw = (await this.postJson(
      {
        action: 'runtime_status',
        customer_id: customerId,
        runtime,
      },
      session
    )) as unknown;

    return sanitizeRuntimeStatus(raw, { customerId, runtime });
  }

  async revokeSession(): Promise<IEvaosBrokerSessionStatus> {
    const session = this.session;
    this.session = null;

    if (session && !isSessionExpired(session, this.now())) {
      await this.postJson({ action: 'revoke_desktop_session' }, session).catch((): void => undefined);
    }

    return this.getSessionStatus();
  }

  private requireActiveSession(): EvaosDesktopSession {
    if (!this.session) {
      throw new EvaosBrokerSessionError('missing_session', 'Sign in to evaOS before checking runtime status.');
    }

    if (isSessionExpired(this.session, this.now())) {
      throw new EvaosBrokerSessionError('expired_session', 'Your evaOS desktop session has expired. Sign in again.');
    }

    return this.session;
  }

  private async postJson(body: Record<string, unknown>, session?: EvaosDesktopSession): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (session) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch {
      throw new EvaosBrokerSessionError('broker_network_error', 'The evaOS broker could not be reached.');
    }

    if (!response.ok) {
      throw new EvaosBrokerSessionError('broker_http_error', brokerHttpMessage(response.status), response.status);
    }

    try {
      return await response.json();
    } catch {
      throw new EvaosBrokerSessionError('broker_invalid_response', 'The evaOS broker returned an invalid response.');
    }
  }
}

export function getDefaultEvaosBrokerSessionClient(): EvaosBrokerSessionClient {
  if (!defaultClient) {
    defaultClient = new EvaosBrokerSessionClient();
  }
  return defaultClient;
}

export function resetDefaultEvaosBrokerSessionClientForTests(): void {
  defaultClient = null;
}

export function evaosBrokerErrorMessage(error: unknown): string {
  if (error instanceof EvaosBrokerSessionError) {
    return error.message;
  }
  return 'The evaOS broker request failed safely.';
}

export function isEvaosBrokerSessionError(error: unknown): error is EvaosBrokerSessionError {
  return error instanceof EvaosBrokerSessionError;
}

function normalizeEndpoint(endpoint: string | undefined): string {
  const trimmed = endpoint?.trim();
  return trimmed || EVAOS_DESKTOP_RUNTIME_SESSION_ENDPOINT;
}

function normalizeDeviceCode(value: string): string {
  return value
    .toUpperCase()
    .split('')
    .filter((char) => /[A-Z0-9]/.test(char))
    .join('')
    .slice(0, 80);
}

function normalizeRuntime(runtime: IEvaosRuntimeKey): IEvaosRuntimeKey {
  if (VALID_RUNTIME_KEYS.has(runtime)) {
    return runtime;
  }
  throw new EvaosBrokerSessionError('invalid_runtime', 'Choose a supported evaOS runtime.');
}

function normalizeRequiredText(value: string, code: EvaosBrokerErrorCode, message: string): string {
  const safe = safeText(value);
  if (!safe) {
    throw new EvaosBrokerSessionError(code, message);
  }
  return safe;
}

function sessionStatus(session: EvaosDesktopSession | null, now: Date): IEvaosBrokerSessionStatus {
  if (!session) {
    return {
      state: 'missing',
      authenticated: false,
      expired: false,
      source: 'none',
      message: 'Sign in to evaOS to connect this desktop shell.',
    };
  }

  const expired = isSessionExpired(session, now);
  return {
    state: expired ? 'expired' : 'authenticated',
    authenticated: !expired,
    expired,
    userEmail: safeText(session.userEmail),
    expiresAt: safeIsoDate(session.expiresAt),
    source: session.source ?? 'memory',
    message: expired ? 'Your evaOS desktop session has expired. Sign in again.' : 'evaOS desktop session is active.',
  };
}

function loadSessionFromEnvironment(env: Record<string, string | undefined>): EvaosDesktopSession | null {
  const accessToken = safeRawSecret(env.AIONUI_EVAOS_DESKTOP_SESSION);
  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    userEmail: safeText(env.AIONUI_EVAOS_DESKTOP_SESSION_EMAIL),
    expiresAt: safeIsoDate(env.AIONUI_EVAOS_DESKTOP_SESSION_EXPIRES_AT),
    source: 'environment',
  };
}

function isSessionExpired(session: EvaosDesktopSession, now: Date): boolean {
  const expiresAt = safeIsoDate(session.expiresAt);
  if (!expiresAt) {
    return true;
  }
  return Date.parse(expiresAt) <= now.getTime();
}

function sanitizeRuntimeStatus(
  raw: unknown,
  fallback: { customerId: string; runtime: IEvaosRuntimeKey }
): IEvaosRuntimeStatusView {
  const record = asRecord(raw);
  if (!record) {
    throw new EvaosBrokerSessionError('broker_invalid_response', 'The evaOS broker returned an invalid response.');
  }

  const runtime = normalizeRuntimeValue(record.runtime_key) ?? normalizeRuntimeValue(record.runtime);
  const status = safeText(record.status);
  if (!runtime || !status) {
    throw new EvaosBrokerSessionError('broker_invalid_response', 'The evaOS broker returned an invalid response.');
  }

  const displayLabel = safeText(record.display_label) ?? RUNTIME_LABELS[runtime];
  const customerId = safeText(record.customer_id) ?? fallback.customerId;

  return stripUndefined({
    schemaVersion: safeText(record.schema_version),
    customerAccountId: safeText(record.customer_account_id),
    customerId,
    runtimeKey: runtime,
    displayLabel,
    status,
    healthSummary: safeText(record.health_summary),
    lastCheckedAt: safeIsoDate(record.last_checked_at),
    roomId: safeText(record.room_id),
    currentUrlSummary: summarizeUrl(record.current_url),
    owner: safeText(record.owner),
    authNeeded: safeBoolean(record.auth_needed ?? record.needs_auth),
    captchaNeeded: safeBoolean(record.captcha_needed ?? record.needs_captcha),
    waitingOnUser: safeBoolean(record.waiting_on_user),
    controlSessionActive: safeBoolean(record.control_session_active),
    updateAvailable: safeBoolean(record.update_available),
    lastActivityAt: safeIsoDate(record.last_activity_at),
    actions: safeActionList(record.actions),
    sourcePointer: safeText(record.source_pointer),
    auditId: safeText(record.audit_id),
  });
}

function normalizeRuntimeValue(value: unknown): IEvaosRuntimeKey | undefined {
  const text = safeText(value);
  if (!text) {
    return undefined;
  }
  return VALID_RUNTIME_KEYS.has(text as IEvaosRuntimeKey) ? (text as IEvaosRuntimeKey) : undefined;
}

function summarizeUrl(value: unknown): IEvaosSafeUrlSummary | undefined {
  if (typeof value === 'string') {
    return summarizeUrlString(value);
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const displaySummary = summarizePossiblySchemalessUrl(record.display_text ?? record.displayText);
  if (displaySummary?.host) {
    return {
      ...displaySummary,
      redacted: true,
    };
  }

  const host = safeUrlHost(record.host);
  const path = safeUrlPath(record.path);
  const displayText = host ? `${host}${path ?? ''}` : displaySummary?.displayText;
  if (!displayText && !host) {
    return undefined;
  }

  return stripUndefined({
    scheme: safeUrlScheme(record.scheme),
    host,
    path,
    displayText,
    redacted: true,
  });
}

function summarizePossiblySchemalessUrl(value: unknown): IEvaosSafeUrlSummary | undefined {
  const text = safeText(value);
  if (!text) {
    return undefined;
  }

  const looksUrlLike =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^[^/\s?#]+\.[^/\s?#]+(?::\d+)?(?:[/?#].*)?$/i.test(text);
  if (!looksUrlLike && !/[?#]/.test(text)) {
    return {
      displayText: text,
      redacted: false,
    };
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  return summarizeUrlString(candidate);
}

function summarizeUrlString(value: string): IEvaosSafeUrlSummary | undefined {
  if (containsSecretMaterial(value)) {
    try {
      const url = new URL(value);
      const path = url.pathname === '/' ? '' : url.pathname;
      return stripUndefined({
        scheme: safeText(url.protocol.replace(/:$/, '')),
        host: safeText(url.host),
        path: safeText(path),
        displayText: `${url.host}${path}`,
        redacted: true,
      });
    } catch {
      return undefined;
    }
  }

  try {
    const url = new URL(value);
    const path = url.pathname === '/' ? '' : url.pathname;
    return stripUndefined({
      scheme: safeText(url.protocol.replace(/:$/, '')),
      host: safeText(url.host),
      path: safeText(path),
      displayText: `${url.host}${path}`,
      redacted: Boolean(url.search || url.hash),
    });
  } catch {
    const trimmed = value.trim();
    const queryless = trimmed.split(/[?#]/, 1)[0];
    const text = safeText(queryless);
    return text
      ? {
          displayText: text,
          redacted: queryless !== trimmed,
        }
      : undefined;
  }
}

function safeUrlScheme(value: unknown): string | undefined {
  const scheme = safeText(value, 20)?.toLowerCase().replace(/:$/, '');
  return scheme === 'http' || scheme === 'https' ? scheme : undefined;
}

function safeUrlHost(value: unknown): string | undefined {
  const host = safeText(value, 200);
  if (!host || /[/?#]/.test(host) || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    return undefined;
  }
  return host;
}

function safeUrlPath(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const queryless = value.trim().split(/[?#]/, 1)[0];
  const path = safeText(queryless, 300);
  if (!path) {
    return undefined;
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function safeActionList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const actions = value.map((item) => safeText(item, 80)).filter((item): item is string => Boolean(item));

  return actions.length > 0 ? actions : undefined;
}

function safeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function safeText(value: unknown, maxLength = MAX_SAFE_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || containsSecretMaterial(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function safeIsoDate(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : undefined;
  if (!text || containsSecretMaterial(text)) {
    return undefined;
  }
  const time = Date.parse(text);
  if (!Number.isFinite(time)) {
    return undefined;
  }
  return new Date(time).toISOString();
}

function safeRawSecret(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function containsSecretMaterial(value: string): boolean {
  return SECRET_FIELD_PATTERN.test(value) || SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stripUndefined<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) {
      delete record[key];
    }
  }
  return record;
}

function brokerHttpMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'The evaOS broker denied this desktop session. Sign in again.';
  }
  if (status === 404) {
    return 'The evaOS broker endpoint was not found.';
  }
  if (status >= 500) {
    return 'The evaOS broker is temporarily unavailable.';
  }
  return 'The evaOS broker rejected the request.';
}
