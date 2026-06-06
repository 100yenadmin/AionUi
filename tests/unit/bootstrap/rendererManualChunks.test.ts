/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { getRendererManualChunk } from '../../../packages/desktop/electronRendererManualChunks';

describe('renderer manual chunk classification', () => {
  it('keeps actual React runtime packages in vendor-react', () => {
    expect(getRendererManualChunk('/repo/node_modules/.bun/react@19.2.4/node_modules/react/index.js')).toBe(
      'vendor-react'
    );
    expect(
      getRendererManualChunk('/repo/node_modules/.bun/react-dom@19.2.4_react@19.2.4/node_modules/react-dom/client.js')
    ).toBe('vendor-react');
    expect(getRendererManualChunk('/repo/node_modules/.bun/scheduler@0.27.0/node_modules/scheduler/index.js')).toBe(
      'vendor-react'
    );
  });

  it('does not classify React-named UI packages as the React runtime chunk', () => {
    expect(
      getRendererManualChunk(
        '/repo/node_modules/.bun/@monaco-editor+react@4.7.0/node_modules/@monaco-editor/react/dist/index.js'
      )
    ).toBe('vendor-editor');
    expect(
      getRendererManualChunk(
        '/repo/node_modules/.bun/@arco-design+web-react@2.66.11/node_modules/@arco-design/web-react/es/index.js'
      )
    ).toBe('vendor-arco');
    expect(
      getRendererManualChunk('/repo/node_modules/.bun/@icon-park+react@1.4.2/node_modules/@icon-park/react/es/index.js')
    ).toBe('vendor-icons');
  });

  it('keeps non-node_modules app files in their owning route chunks', () => {
    expect(
      getRendererManualChunk('/repo/packages/desktop/src/renderer/pages/mission-control/index.tsx')
    ).toBeUndefined();
  });
});
