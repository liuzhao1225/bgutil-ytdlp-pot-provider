import test from 'node:test';
import assert from 'node:assert/strict';
const { SessionRuntime } = await import(`../${process.env.BGUTIL_TEST_BUILD || 'build'}/session_runtime.js`);
const fixture = new URL('./runtime-fixture.mjs', import.meta.url);
test('reset drains prior requests and discards all worker state', async () => {
 const runtime = new SessionRuntime(fixture);
 try {
  const first = runtime.generatePoToken('one');
  const second = runtime.generatePoToken('two');
  const reset = runtime.invalidateCaches();
  const next = runtime.generatePoToken('three');
  assert.deepEqual(await Promise.all([first,second,reset,next]), [1,2,undefined,1]);
  await Promise.all([runtime.invalidateCaches(),runtime.invalidateCaches()]);
  assert.equal(await runtime.generatePoToken('four'),1);
 } finally {await runtime.close();}
});
test('mint errors propagate without breaking subsequent requests', async () => {
 const runtime = new SessionRuntime(fixture);
 try {
  await assert.rejects(runtime.generatePoToken('error'), /original mint error/);
  assert.equal(await runtime.generatePoToken('ok'),1);
 } finally {await runtime.close();}
});
test('worker crash stays visible until explicit reset', async () => {
 const runtime = new SessionRuntime(fixture);
 try {
  await assert.rejects(runtime.generatePoToken('crash'), /exited with code 7/);
  await assert.rejects(runtime.generatePoToken('ok'), /exited with code 7/);
  await runtime.invalidateCaches();
  assert.equal(await runtime.generatePoToken('ok'),1);
 } finally {await runtime.close();}
});
test('initialization failure rejects reset rather than reporting success', async () => {
 const runtime = new SessionRuntime(new URL('./does-not-exist.mjs', import.meta.url));
 try {await assert.rejects(runtime.invalidateCaches(), /Cannot find module/);}
 finally {await runtime.close();}
});
test('real SessionManager isolates DOM and survives repeated runtime replacement', async () => {
 const runtime = new SessionRuntime();
 try {
  assert.equal(globalThis.window, undefined);
  for (let i = 0; i < 3; i++) {
   await runtime.invalidateCaches();
   assert.deepEqual(await runtime.minterCacheKeys(), []);
   assert.equal(globalThis.window, undefined);
  }
 } finally {await runtime.close();}
});
