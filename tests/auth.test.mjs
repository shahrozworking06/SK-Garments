import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/admin.js', import.meta.url),'utf8')
  .replace(/^import .*;\n/,'').replace(/initializeAuth\(\);\s*$/,'');
function setup(callback = null) {
  const nodes = new Map(), calls = [];
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {
        value:'', textContent:'',
        elements: {email:{value:'owner@example.test',focus(){}},password:{value:'a-long-new-password',focus(){}},confirm:{value:'a-long-new-password'}},
        classList:{ add:c=>classes.add(c), remove:c=>classes.delete(c), contains:c=>classes.has(c), toggle(c,enabled){if(enabled)classes.add(c);else classes.delete(c);} },
        querySelector:()=>({disabled:false}), addEventListener(){},setAttribute(){},removeAttribute(){},reset(){}
      });
    }
    return nodes.get(id);
  };
  const context = vm.createContext({
    document:{getElementById:node, querySelectorAll:()=>[]},
    location:{pathname:'/admin',search:''}, history:{replaceState(){calls.push('clearHash');}},
    handleAuthCallback:async()=>{if(callback instanceof Error)throw callback;return callback;},
    requestPasswordRecovery:async email=>calls.push(['recover',email]),
    updateUser:async data=>calls.push(['update',data.password.length]),
    acceptInvite:async()=>calls.push('acceptInvite'),
    getUser:async()=>null,
    fetch:async()=>{calls.push('fetch');return {ok:false,json:async()=>({error:'Please sign in to the owner panel.'})};}
  });
  vm.runInContext(source+'\nglobalThis.initialize = initializeAuth;',context);
  return {context,node,calls};
}
test('recovery callback shows new-password form before loading private data',async()=>{
  const {context,node,calls}=setup({type:'recovery',user:{}});
  await context.initialize();
  assert.equal(node('passwordForm').classList.contains('hidden'),false);
  assert.equal(node('loginForm').classList.contains('hidden'),true);
  assert.ok(!calls.includes('fetch'));
});
test('invitation is accepted only after matching passwords are entered',async()=>{
  const {context,node,calls}=setup({type:'invite',token:'test-only-placeholder'});
  await context.initialize();
  assert.equal(node('passwordTitle').textContent,'Set your owner password');
  const form=node('passwordForm');
  form.elements.confirm.value='different-password';
  await form.onsubmit({preventDefault(){},target:form});
  assert.equal(node('authStatus').textContent,'Passwords do not match.');
  assert.ok(!calls.includes('acceptInvite'));
  form.elements.confirm.value=form.elements.password.value;
  await form.onsubmit({preventDefault(){},target:form});
  assert.ok(calls.includes('acceptInvite'));
});
test('forgot password sends the supplied email and shows a neutral result',async()=>{
  const {node,calls}=setup();
  const form=node('recoveryForm');
  await form.onsubmit({preventDefault(){},target:form});
  assert.deepEqual(calls[0],['recover','owner@example.test']);
  assert.match(node('authStatus').textContent,/If an account exists/);
});
test('expired links show recovery instructions and clear the URL',async()=>{
  const {context,node,calls}=setup(new Error('Expired'));
  await context.initialize();
  assert.match(node('authStatus').textContent,/invalid or has expired/);
  assert.ok(calls.includes('clearHash'));
});
