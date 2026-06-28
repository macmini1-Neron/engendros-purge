// gpucheck.test.mjs — node --test suite for src/gpucheck.js
// Classifies the unmasked WebGL renderer string into a perf tier for the low-end helper notice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRenderer } from '../../src/gpucheck.js';

// Real strings captured via WEBGL_debug_renderer_info on actual browsers.
const INTEL_IRIS = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const NVIDIA_3070 = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Ti Laptop GPU (0x000024E0) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const AMD_RX = 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)';
const INTEL_UHD = 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const MALI = 'ANGLE (ARM, Mali-G78 MC14, OpenGL ES 3.2)';
const BASIC = 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)';
const NVIDIA_RAW = 'NVIDIA GeForce RTX 4090/PCIe/SSE2'; // non-ANGLE (Linux/desktop GL)

// ─── weak: integrated / software / mobile ─────────────────────────────────────

test('Intel Iris Xe → weak / integrated', () => {
  const r = classifyRenderer(INTEL_IRIS);
  assert.equal(r.tier, 'weak');
  assert.equal(r.kind, 'integrated');
  assert.match(r.label, /Iris Xe/);
  assert.ok(!/\(R\)/.test(r.label), 'label strips (R)/(TM) noise');
});

test('Intel UHD 630 → weak / integrated', () => {
  assert.equal(classifyRenderer(INTEL_UHD).tier, 'weak');
  assert.equal(classifyRenderer(INTEL_UHD).kind, 'integrated');
});

test('SwiftShader → weak / software', () => {
  const r = classifyRenderer(SWIFTSHADER);
  assert.equal(r.tier, 'weak');
  assert.equal(r.kind, 'software');
});

test('Microsoft Basic Render Driver → weak / software', () => {
  assert.equal(classifyRenderer(BASIC).kind, 'software');
  assert.equal(classifyRenderer(BASIC).tier, 'weak');
});

test('Mali (mobile) → weak / mobile', () => {
  assert.equal(classifyRenderer(MALI).tier, 'weak');
  assert.equal(classifyRenderer(MALI).kind, 'mobile');
});

// ─── ok: discrete ─────────────────────────────────────────────────────────────

test('NVIDIA RTX 3070 Ti → ok / discrete', () => {
  const r = classifyRenderer(NVIDIA_3070);
  assert.equal(r.tier, 'ok');
  assert.equal(r.kind, 'discrete');
  assert.match(r.label, /RTX 3070 Ti/);
});

test('AMD Radeon RX 6800 XT → ok / discrete (NOT mistaken for integrated)', () => {
  const r = classifyRenderer(AMD_RX);
  assert.equal(r.tier, 'ok');
  assert.equal(r.kind, 'discrete');
});

test('non-ANGLE NVIDIA string → ok / discrete', () => {
  assert.equal(classifyRenderer(NVIDIA_RAW).tier, 'ok');
});

// ─── unknown: masked / empty → never warn ─────────────────────────────────────

test('masked / empty / null → unknown (no false alarm)', () => {
  for (const v of ['', null, undefined, '(masked)', 'unknown']) {
    assert.equal(classifyRenderer(v).tier, 'unknown', `"${v}" must be unknown`);
  }
});

test('a bare vendor with no recognizable GPU → unknown, not weak', () => {
  // Don't warn just because we can't tell — only warn on a positive weak match.
  assert.equal(classifyRenderer('ANGLE (Qualcomm, Foobar 9000, D3D11)').tier, 'unknown');
});
