// Integrity of the 1-bit chip-portrait masks (Marx/Lenin). chipskins.js reads them as w*h row-major
// MSB-first bits — a truncated/corrupt base64 would silently mis-paint the portrait, so pin the byte count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PORTRAITS } from '../../src/poker/chipportraits.js';

test('each chip portrait mask decodes to exactly ceil(w*h/8) bytes', () => {
  const names = Object.keys(PORTRAITS);
  assert.ok(names.length >= 2, 'marx + lenin masks present');
  for (const [name, p] of Object.entries(PORTRAITS)) {
    assert.ok(Number.isInteger(p.w) && p.w > 0, `${name}: positive width`);
    assert.ok(Number.isInteger(p.h) && p.h > 0, `${name}: positive height`);
    assert.equal(typeof p.bits, 'string');
    const bytes = Buffer.from(p.bits, 'base64');
    const want = Math.ceil((p.w * p.h) / 8);
    assert.equal(bytes.length, want, `${name}: ${p.w}x${p.h} packs to ${want} bytes, got ${bytes.length}`);
  }
});

test('the known masks have their documented dimensions (regression guard on the source art)', () => {
  assert.equal(PORTRAITS.marx.w, 55); assert.equal(PORTRAITS.marx.h, 64);   // 55*64 = 3520 bits → 440 bytes
  assert.equal(PORTRAITS.lenin.w, 50); assert.equal(PORTRAITS.lenin.h, 64); // 50*64 = 3200 bits → 400 bytes
  assert.equal(Buffer.from(PORTRAITS.marx.bits, 'base64').length, 440);
  assert.equal(Buffer.from(PORTRAITS.lenin.bits, 'base64').length, 400);
});
