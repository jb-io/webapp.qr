import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatrix } from '../src/core/matrix.ts';
import { computeLayout, logoBoxFor, renderSvg } from '../src/core/render.ts';
import { analyze, contrastRatio } from '../src/core/analysis.ts';
import { DEFAULT_STYLE } from '../src/core/types.ts';

test('matrix figures', () => {
  const m = createMatrix('https://example.org', { ecLevel: 'M', minVersion: 0, mask: -1 });
  assert.equal(m.version, 2);
  assert.equal(m.size, 25);
  assert.equal(m.ecLevel, 'M');
  assert.equal(m.dark.length, 625);
  assert.ok(m.usedDataBits > 0 && m.usedDataBits <= m.capacityDataBits);
  assert.equal(m.totalCodewords, 44);
  const fixed = createMatrix('x', { ecLevel: 'H', minVersion: 5, mask: 3 });
  assert.equal(fixed.version, 5);
  assert.equal(fixed.mask, 3);
});

test('too small fixed version falls back to the minimum', () => {
  const m = createMatrix('a'.repeat(200), { ecLevel: 'L', minVersion: 1, mask: -1 });
  assert.ok(m.version > 1);
});

test('svg contains finder patterns, label and escapes', () => {
  const m = createMatrix('hi', { ecLevel: 'L', minVersion: 0, mask: -1 });
  const { svg, layout } = renderSvg(m, { ...DEFAULT_STYLE, label: 'Scan <me>', frame: 'banner' }, 512);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /Scan &lt;me&gt;/);
  assert.match(svg, / width="512"/);
  assert.ok(layout.height > layout.width);
  for (const shape of ['square', 'rounded', 'dots', 'gapped'] as const) {
    assert.ok(renderSvg(m, { ...DEFAULT_STYLE, moduleShape: shape }).svg.length > 200);
  }
});

test('logo box is centred on the grid', () => {
  for (const size of [21, 25, 57]) {
    const b = logoBoxFor(size, 0.22);
    assert.equal(b.start * 2 + b.size, size);
    assert.ok(Number.isInteger(b.start));
  }
});

test('layout without frame equals symbol plus quiet zone', () => {
  const m = createMatrix('hi', { ecLevel: 'L', minVersion: 0, mask: -1 });
  const l = computeLayout(m, DEFAULT_STYLE);
  assert.equal(l.width, 21 + 8);
  assert.equal(l.height, 21 + 8);
});

test('analysis flags weak contrast and oversized logos', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  const m = createMatrix('https://example.org', { ecLevel: 'L', minVersion: 0, mask: -1 });
  const weak = analyze(m, { ...DEFAULT_STYLE, foreground: '#cccccc' }, 1024);
  assert.equal(weak.quality, 'poor');
  const logo = analyze(m, { ...DEFAULT_STYLE, logo: 'data:image/png;base64,AA==', logoSize: 0.3 }, 1024);
  assert.ok(logo.findings.some((f) => f.code === 'logoTooLarge'));
  assert.equal(analyze(m, DEFAULT_STYLE, 1024).quality, 'good');
});
