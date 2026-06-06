/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

function getNodePackageName(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/').split('?')[0];
  const nodeModulesIndex = normalized.lastIndexOf('/node_modules/');
  if (nodeModulesIndex === -1) return undefined;

  const packagePath = normalized.slice(nodeModulesIndex + '/node_modules/'.length);
  const segments = packagePath.split('/').filter(Boolean);
  if (segments.length === 0) return undefined;
  if (segments[0]?.startsWith('@') && segments[1]) return `${segments[0]}/${segments[1]}`;
  return segments[0];
}

function isMarkdownPackage(packageName: string): boolean {
  return (
    packageName === 'react-markdown' ||
    packageName.startsWith('remark-') ||
    packageName.startsWith('rehype-') ||
    packageName === 'unified' ||
    packageName.startsWith('mdast-') ||
    packageName.startsWith('hast-') ||
    packageName.startsWith('micromark')
  );
}

function isHighlightPackage(packageName: string): boolean {
  return packageName === 'react-syntax-highlighter' || packageName === 'refractor' || packageName === 'highlight.js';
}

function isEditorPackage(packageName: string): boolean {
  return (
    packageName === 'monaco-editor' ||
    packageName.startsWith('@monaco-editor/') ||
    packageName === 'codemirror' ||
    packageName.startsWith('@codemirror/') ||
    packageName.startsWith('@lezer/')
  );
}

export function getRendererManualChunk(id: string): string | undefined {
  const packageName = getNodePackageName(id);
  if (!packageName) return undefined;

  if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') return 'vendor-react';
  if (packageName.startsWith('@arco-design/')) return 'vendor-arco';
  if (isMarkdownPackage(packageName)) return 'vendor-markdown';
  if (isHighlightPackage(packageName)) return 'vendor-highlight';
  if (isEditorPackage(packageName)) return 'vendor-editor';
  if (packageName === 'katex') return 'vendor-katex';
  if (packageName.startsWith('@icon-park/')) return 'vendor-icons';
  if (packageName === 'diff2html') return 'vendor-diff';
  return undefined;
}
