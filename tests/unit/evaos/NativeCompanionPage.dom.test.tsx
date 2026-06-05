/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NativeCompanionPage from '@/renderer/pages/native-companion';

vi.mock('@renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

describe('NativeCompanionPage', () => {
  it('renders native boundary status without granting local trust authority', () => {
    const { container } = render(<NativeCompanionPage />);

    expect(screen.getByText('Mac & iPhone')).toBeInTheDocument();
    expect(screen.getByText('Native companion boundary')).toBeInTheDocument();
    expect(screen.getByText('Boundary clean')).toBeInTheDocument();
    expect(screen.getByText('Not paired')).toBeInTheDocument();
    expect(screen.getByText('Needs permission')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(container.textContent).toContain('AionUi shell is local trust authority: false');
    expect(container.textContent).toContain('Renderer receives native secrets: false');
    expect(container.textContent).toContain('Deep-link scheme: evaos-workbench-beta');
    expect(container.textContent).toContain('Renderer receives callback secrets: false');
    expect(container.textContent).toContain('broker session handoff');
    expect(container.textContent).toContain('signed beta passes issue #12 packaging, rollback, and support gates');
    expect(container.textContent).not.toMatch(/eds_|epg_|access_token|desktop[_-]?session|provider_grant|Bearer/i);
  });
});
