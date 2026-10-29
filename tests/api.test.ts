import { test } from 'node:test';
import assert from 'node:assert/strict';
import api from '../netlify/functions/api.mts';

test('all owner endpoints reject unauthenticated requests before database access', async () => {
  for (const [path, method] of [['me','GET'], ['summary','GET'], ['products','GET'], ['products','POST'], ['products/1','PUT'], ['products/1','DELETE'], ['orders','GET'], ['orders/1','PATCH'], ['settings','GET'], ['settings','PUT'], ['messages','GET'], ['messages/reply','POST'], ['upload','POST']]) {
    const response = await api(new Request('https://store.example/api/admin/' + path, { method }));
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match((await response.json()).error, /sign in/);
  }
});

test('cross-origin mutations are rejected', async () => {
  const response = await api(new Request('https://store.example/api/orders', { method: 'POST', headers: { origin: 'https://unrelated.example' } }));
  assert.equal(response.status, 403);
});

test('invalid image keys are rejected before storage access', async () => {
  const response = await api(new Request('https://store.example/api/images/invalid.svg'));
  assert.equal(response.status, 404);
});
