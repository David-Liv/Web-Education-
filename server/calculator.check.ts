import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot } from './app.ts';

test('Calculator state persists per-user via /api/v1/calculator and appears in /bootstrap', async () => {
  const app = createPilot({ database: ':memory:', allowSetup: false });
  const port = await app.listen(0);
  const base = `http://127.0.0.1:${port}`;
  try {
    const alice = await app.store.createUser('calc_alice', 'password-1234', 'Alice', 'student');
    const bob = await app.store.createUser('calc_bob', 'password-1234', 'Bob', 'student');
    const aliceCookie = `hokse_session=${await app.store.session(alice)}`;
    const bobCookie = `hokse_session=${await app.store.session(bob)}`;

    const call = async (path: string, cookie: string, method = 'GET', body?: unknown) => {
      const res = await fetch(`${base}/api/v1${path}`, {
        method,
        headers: {
          Cookie: cookie,
          'X-Hokse-Client': '1',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, data: await res.json() };
    };

    // Defaults to fx-50fh-ii with empty P1-P4
    const initial = await call('/calculator', aliceCookie);
    assert.equal(initial.status, 200);
    assert.equal(initial.data.model, 'fx-50fh-ii');
    assert.deepEqual(initial.data.programs, { 1: '', 2: '', 3: '', 4: '' });

    // Save Alice's custom program & model switch
    const saved = await call('/calculator', aliceCookie, 'PUT', {
      model: 'fx-3650p-ii',
      angleUnit: 'RAD',
      formatKind: 'FIX',
      formatDigits: 4,
      programs: { 1: '?→A:A²', 2: '', 3: '', 4: '' },
      variables: { A: 5, B: 0, C: 0, D: 0, X: 0, Y: 0, M: 12 },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.model, 'fx-3650p-ii');
    assert.equal(saved.data.programs['1'], '?→A:A²');
    assert.equal(saved.data.variables.M, 12);

    // Bootstrap reflects Alice's saved calculator state
    const boot = await call('/bootstrap', aliceCookie);
    assert.equal(boot.status, 200);
    assert.equal(boot.data.calculator.model, 'fx-3650p-ii');
    assert.equal(boot.data.calculator.programs['1'], '?→A:A²');

    // Bob remains isolated with default state
    const bobState = await call('/calculator', bobCookie);
    assert.equal(bobState.status, 200);
    assert.equal(bobState.data.model, 'fx-50fh-ii');
    assert.equal(bobState.data.programs['1'], '');
  } finally {
    await app.close();
  }
});
