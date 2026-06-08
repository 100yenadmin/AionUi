/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useMemo } from 'react';

export type WorkbenchAccountRole =
  | 'owner'
  | 'admin'
  | 'billing_admin'
  | 'technical_admin'
  | 'manager'
  | 'member'
  | 'agent_only'
  | 'support'
  | string;

export type WorkbenchAccountScope =
  | 'manage_members'
  | 'manage_billing'
  | 'manage_integrations'
  | 'approve_actions'
  | 'open_business_browser'
  | 'use_creative_studio'
  | 'use_design_workspace'
  | 'view_company_brain'
  | 'manage_company_brain'
  | 'assign_agents'
  | 'access_openclaw_dashboard'
  | 'access_hermes_dashboard'
  | 'access_terminal'
  | 'access_technical_diagnostics'
  | string;

export type WorkbenchBrokerPolicy = {
  role?: WorkbenchAccountRole | null;
  scopes?: readonly WorkbenchAccountScope[] | null;
  customerAccountId?: string | null;
  profileId?: string | null;
};

export type WorkbenchPolicyContextValue = {
  policy: WorkbenchBrokerPolicy | null;
};

export type WorkbenchPolicyOptions = {
  isDesktop?: boolean;
};

const WorkbenchPolicyContext = createContext<WorkbenchPolicyContextValue>({ policy: null });

const OWNER_ROLES = new Set(['owner']);

const ROLE_FALLBACK_SCOPES: Record<string, readonly WorkbenchAccountScope[]> = {
  admin: [
    'manage_members',
    'manage_integrations',
    'approve_actions',
    'open_business_browser',
    'use_creative_studio',
    'use_design_workspace',
    'view_company_brain',
    'manage_company_brain',
    'assign_agents',
  ],
  billing_admin: ['manage_billing'],
  technical_admin: [
    'manage_integrations',
    'open_business_browser',
    'use_creative_studio',
    'use_design_workspace',
    'view_company_brain',
    'assign_agents',
    'access_openclaw_dashboard',
    'access_hermes_dashboard',
    'access_terminal',
    'access_technical_diagnostics',
  ],
  manager: ['approve_actions', 'open_business_browser', 'view_company_brain', 'assign_agents'],
  member: ['open_business_browser', 'view_company_brain'],
  agent_only: [],
  support: [
    'open_business_browser',
    'view_company_brain',
    'access_openclaw_dashboard',
    'access_hermes_dashboard',
    'access_technical_diagnostics',
  ],
};

export const SETTINGS_ACCESS_DENY_FALLBACK = '/settings/about';
export const WORKBENCH_ACCESS_DENY_FALLBACK = '/guid';
export const BUILTIN_SETTINGS_TAB_IDS = [
  'agent',
  'model',
  'assistants',
  'capabilities',
  'display',
  'webui',
  'pet',
  'system',
  'about',
] as const;

export const SETTINGS_TAB_ACCESS: Record<string, readonly WorkbenchAccountScope[]> = {
  about: [],
  model: ['manage_integrations'],
  assistants: ['assign_agents'],
  agent: ['assign_agents'],
  capabilities: ['manage_integrations'],
  display: ['use_design_workspace'],
  webui: ['access_technical_diagnostics'],
  pet: ['use_creative_studio'],
  system: ['access_technical_diagnostics'],
};

function scopesForPolicy(policy: WorkbenchBrokerPolicy): Set<string> {
  const role = policy.role ?? 'member';
  const scopes = policy.scopes && policy.scopes.length > 0 ? policy.scopes : (ROLE_FALLBACK_SCOPES[role] ?? []);
  return new Set(scopes);
}

/**
 * Checks whether a broker policy grants at least one required scope.
 *
 * @param policy Broker-provided account policy; null keeps standalone sessions permissive.
 * @param requiredScopes Scope list where any one matching scope is sufficient.
 * @returns True when the route/action is allowed; owner, '*' and 'all' override explicit scopes.
 */
export function hasWorkbenchScope(
  policy: WorkbenchBrokerPolicy | null | undefined,
  requiredScopes: readonly WorkbenchAccountScope[]
): boolean {
  if (!policy || requiredScopes.length === 0) return true;
  if (policy.role && OWNER_ROLES.has(policy.role)) return true;

  const scopes = scopesForPolicy(policy);
  if (scopes.has('*') || scopes.has('all')) return true;
  return requiredScopes.some((scope) => scopes.has(scope));
}

/**
 * Checks whether a built-in settings tab is visible for the current policy and platform.
 *
 * @param tabId Built-in settings tab id.
 * @param policy Broker-provided account policy; null keeps standalone sessions permissive.
 * @param options Platform flags; pet settings are desktop-only when isDesktop is false.
 * @returns True when the tab can be shown or opened.
 */
export function canAccessBuiltinSettingsTab(
  tabId: string,
  policy: WorkbenchBrokerPolicy | null | undefined,
  options: WorkbenchPolicyOptions = {}
): boolean {
  if (tabId === 'pet' && options.isDesktop === false) return false;
  return hasWorkbenchScope(policy, SETTINGS_TAB_ACCESS[tabId] ?? ['access_technical_diagnostics']);
}

/**
 * Checks whether extension-provided settings tabs are available.
 *
 * @param policy Broker-provided account policy; null keeps standalone sessions permissive.
 * @returns True when provider/admin or diagnostics scopes allow extension settings.
 */
export function canAccessExtensionSettings(policy: WorkbenchBrokerPolicy | null | undefined): boolean {
  return hasWorkbenchScope(policy, ['manage_integrations', 'access_technical_diagnostics']);
}

/**
 * Returns the first policy-allowed settings route from the ordered built-in tab list.
 *
 * @param orderedTabIds Ordered built-in tab ids from the settings navigation.
 * @param policy Broker-provided account policy; null keeps standalone sessions permissive.
 * @param options Platform flags forwarded to built-in tab checks.
 * @returns A settings route, preferring model when allowed and falling back to About.
 */
export function getDefaultSettingsPath(
  orderedTabIds: readonly string[],
  policy: WorkbenchBrokerPolicy | null | undefined,
  options: WorkbenchPolicyOptions = {}
): string {
  if (orderedTabIds.includes('model') && canAccessBuiltinSettingsTab('model', policy, options)) {
    return '/settings/model';
  }

  const firstAllowed = orderedTabIds.find((tabId) => canAccessBuiltinSettingsTab(tabId, policy, options));
  return `/settings/${firstAllowed ?? 'about'}`;
}

/**
 * Checks whether a route can be opened under the current broker policy.
 *
 * @param pathname Router pathname being evaluated.
 * @param policy Broker-provided account policy; null keeps standalone sessions permissive.
 * @param options Platform flags forwarded to settings tab checks.
 * @returns True when direct navigation to the route is allowed.
 */
export function canAccessWorkbenchRoute(
  pathname: string,
  policy: WorkbenchBrokerPolicy | null | undefined,
  options: WorkbenchPolicyOptions = {}
): boolean {
  if (!policy) return true;
  if (pathname === '/login' || pathname === '/' || pathname === '') return true;
  if (pathname === '/guid' || pathname.startsWith('/conversation/')) return true;
  if (pathname.startsWith('/team/')) return hasWorkbenchScope(policy, ['manage_members', 'assign_agents']);
  if (pathname === '/scheduled' || pathname.startsWith('/scheduled/')) {
    return hasWorkbenchScope(policy, ['approve_actions', 'assign_agents']);
  }
  if (pathname === '/test/components') return hasWorkbenchScope(policy, ['access_technical_diagnostics']);

  if (pathname === '/settings' || pathname.startsWith('/settings?')) return true;
  if (pathname === '/settings/skills-hub' || pathname === '/settings/tools') {
    return canAccessBuiltinSettingsTab('capabilities', policy, options);
  }
  if (pathname.startsWith('/settings/ext/')) return canAccessExtensionSettings(policy);
  if (pathname.startsWith('/settings/')) {
    const tabId = pathname.slice('/settings/'.length).split('/')[0];
    return canAccessBuiltinSettingsTab(tabId, policy, options);
  }

  return true;
}

/**
 * Resolves a safe fallback route after a broker policy denies direct navigation.
 *
 * @param pathname Denied route pathname.
 * @param orderedSettingsTabIds Ordered built-in tab ids used for settings fallbacks.
 * @param policy Broker-provided account policy; null keeps standalone sessions permissive.
 * @param options Platform flags forwarded to settings default resolution.
 * @returns A settings fallback for denied settings routes, otherwise the workbench deny fallback.
 */
export function getWorkbenchRouteFallback(
  pathname: string,
  orderedSettingsTabIds: readonly string[],
  policy: WorkbenchBrokerPolicy | null | undefined,
  options: WorkbenchPolicyOptions = {}
): string {
  if (pathname.startsWith('/settings/')) {
    return getDefaultSettingsPath(orderedSettingsTabIds, policy, options);
  }
  return WORKBENCH_ACCESS_DENY_FALLBACK;
}

/**
 * Provides the broker policy used by route guards and navigation filters.
 *
 * @param props React children and optional policy; omitted policy is treated as no broker policy loaded.
 * @returns A context provider with a stable policy value.
 */
export const WorkbenchPolicyProvider: React.FC<React.PropsWithChildren<{ policy?: WorkbenchBrokerPolicy | null }>> = ({
  children,
  policy = null,
}) => {
  const value = useMemo<WorkbenchPolicyContextValue>(() => ({ policy }), [policy]);
  return <WorkbenchPolicyContext.Provider value={value}>{children}</WorkbenchPolicyContext.Provider>;
};

/**
 * Reads the current workbench policy context.
 *
 * @returns The policy context value; policy is null before broker policy is available.
 */
export function useWorkbenchPolicy(): WorkbenchPolicyContextValue {
  return useContext(WorkbenchPolicyContext);
}
