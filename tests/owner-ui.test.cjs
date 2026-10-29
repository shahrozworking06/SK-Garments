const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function ui(callback) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) { const classes = new Set(); elements.set(id, { classes, classList: { add(c) { classes.add(c); }, remove(c) { classes.delete(c); }, toggle() {} }, elements: { email: { value: 'owner@example.com' } }, textContent: '' }); }
    return elements.get(id);
  };
  let recoveryCalls = 0;
  const context = vm.createContext({ document: { getElementById: element, querySelectorAll: () => [] }, handleAuthCallback: async () => callback, requestPasswordRecovery: async () => { recoveryCalls++; } });
  const code = fs.readFileSync('admin.js', 'utf8').replace(/^import[^\n]+\n/, '').replace(/startAuth\(\);\s*$/, '');
  vm.runInContext(code, context);
  return { context, element, recoveryCalls: () => recoveryCalls };
}
test('invitation and recovery callbacks open the password form', async () => {
  for (const type of ['invite', 'recovery']) {
    const app = ui({ type });
    await vm.runInContext('startAuth()', app.context);
    assert.equal(app.element('loginError').textContent, '');
    assert.equal(app.element('loginForm').classes.has('hidden'), true);
    assert.equal(app.element('passwordForm').classes.has('hidden'), false);
  }
});
test('password recovery requests use the entered email', async () => {
  const app = ui(null);
  await app.element('forgotPassword').onclick();
  assert.equal(app.recoveryCalls(), 1);
  assert.match(app.element('loginError').textContent, /Check your inbox/);
});
test('recovery requires an email', async () => {
  const app = ui(null);
  app.element('loginForm').elements.email.value = '';
  await app.element('forgotPassword').onclick();
  assert.equal(app.recoveryCalls(), 0);
  assert.match(app.element('loginError').textContent, /Enter your owner email/);
});
