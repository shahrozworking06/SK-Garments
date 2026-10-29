import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
let user = null;
let databaseCalls = 0;
let query = async () => [];
let transactionQueries = [];
mock.module('@netlify/identity', { namedExports: { getUser: async () => user, refreshSession: async () => null } });
mock.module('@netlify/database', {
  namedExports: {
    getDatabase: () => {
      databaseCalls++;
      return {
        sql: (...args) => query(...args),
        pool: {
          connect: async () => ({
            query: async (sql) => { transactionQueries.push(sql); return { rows: [] }; },
            release() { transactionQueries.push('RELEASE'); }
          })
        }
      };
    }
  }
});
mock.module('@netlify/blobs', { namedExports: { getStore: () => { throw new Error('Unexpected image access'); } } });
const { default: handler } = await import('../netlify/functions/store.mts');
const context = { ip: '127.0.0.1' };
const request = (path, method = 'GET', body, origin) => new Request('https://store.example' + path, {
  method, headers: { ...(origin ? { origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});
test('private endpoints reject anonymous users before accessing data', async () => {
  user = null; databaseCalls = 0;
  for (const path of ['/api/admin/me','/api/admin/products','/api/admin/orders','/api/admin/settings','/api/admin/messages']) {
    const response = await handler(request(path),context);
    assert.equal(response.status,401);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(databaseCalls,0);
});
test('a signed-in customer cannot access owner data', async () => {
  user = { roles: ['customer'], userMetadata: { roles: ['admin'] } };
  databaseCalls = 0;
  assert.equal((await handler(request('/api/admin/me'),context)).status,403);
  assert.equal(databaseCalls,0);
});
test('only an admin can obtain owner session details', async () => {
  user = { roles: ['admin'], email: 'owner@example.test' };
  assert.deepEqual(await (await handler(request('/api/admin/me'),context)).json(),{email:user.email});
});
test('cross-origin owner changes are rejected', async () => {
  user = { roles: ['admin'] }; databaseCalls = 0;
  assert.equal((await handler(request('/api/admin/settings','PUT',{},'https://other.example'),context)).status,403);
  assert.equal(databaseCalls,0);
});
test('service failures return a safe message', async () => {
  user = { roles: ['admin'] };
  query = async () => { throw new Error('Database internal diagnostic'); };
  const response = await handler(request('/api/admin/products'),context);
  assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/internal diagnostic/);
});
test('out-of-stock checkout rolls back without creating an order', async () => {
  user = null; transactionQueries = [];
  query = async (strings) => strings.join('').includes('sk_request_limits') ? [{count:1}] : [{key:'bank_enabled',value:'0'}];
  const response = await handler(request('/api/orders','POST',{name:'Store customer',phone:'03001234567',address:'Delivery address',payment:'COD',items:[{id:1,qty:1}]},'https://store.example'),context);
  assert.equal(response.status,400);
  assert.ok(transactionQueries.includes('ROLLBACK'));
  assert.ok(transactionQueries.includes('RELEASE'));
  assert.ok(!transactionQueries.some(sql => sql.startsWith('INSERT INTO sk_orders')));
});
