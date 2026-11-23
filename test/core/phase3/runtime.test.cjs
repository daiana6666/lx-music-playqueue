const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('../../helpers/load-ts-module.cjs')
const settle = async() => new Promise(resolve => setImmediate(resolve))

const fixture = (failInit) => {
  let listener
  const native = new Map()
  const actions = []
  const state = { list: ['A', 'B', 'C', 'D'].map(id => ({ id, version: '1', name: id })) }
  const capabilities = { kw: { type: 'music', actions: ['musicUrl'], qualitys: ['128k', 'flac'] } }
  const runtime = load('src/core/sourceRuntime.ts', {
    '@/utils/nativeModules/userApi': {
      onScriptAction: handler => { listener = handler },
      userApiNative: {
        loadScript: async info => { native.set(info.runtimeId, info); setImmediate(() => listener({ runtimeId: info.runtimeId, action: 'init', data: { status: info.id != failInit, info: { sources: capabilities } } })) },
        sendAction: (id, action, value) => { actions.push({ id, action, value: JSON.parse(value) }) },
        destroy: async id => { native.delete(id) },
      },
    },
    '@/utils/data': { getUserApiScript: async id => `/* ${id} */` },
    '@/store/userApi': { state },
    '@/core/init/userApi/request': { fetchData: () => ({ request: Promise.resolve({ body: 'ok' }), abort() {} }) },
    'react-native-background-timer': { setTimeout, clearTimeout },
  })
  return { runtime, native, actions, state, emit: event => listener(event) }
}
test('a source initialization failure releases its instance and does not poison the next source', async() => {
  const f = fixture('A')
  await assert.rejects(f.runtime.getSourceRuntime('A'), /音源初始化失败/)
  const b = await f.runtime.getSourceRuntime('B')
  assert.equal(b.sourceId, 'B')
  assert.equal(f.native.size, 1)
  await f.runtime.invalidateSourceRuntimes()
})
test('source runtime responses are isolated even when a stale source reuses another request key', async() => {
  const f = fixture()
  await f.runtime.getSourceRuntime('A'); await f.runtime.getSourceRuntime('B')
  const a = f.runtime.requestSource('A', 'kw', 'musicUrl', {}, 'flac')
  const b = f.runtime.requestSource('B', 'kw', 'musicUrl', {}, '128k')
  await settle()
  const [ar, br] = f.actions
  f.emit({ runtimeId: ar.id, action: 'response', data: { requestKey: br.value.requestKey, status: true, result: 'wrong' } })
  f.emit({ runtimeId: ar.id, action: 'response', data: { requestKey: ar.value.requestKey, status: true, result: 'A' } })
  f.emit({ runtimeId: br.id, action: 'response', data: { requestKey: br.value.requestKey, status: true, result: 'B' } })
  assert.deepEqual(await Promise.all([a, b]), ['A', 'B'])
  await f.runtime.invalidateSourceRuntimes()
  assert.equal(f.native.size, 0)
})
test('deleting a source rejects pending work and its old callback cannot resolve a replacement runtime', async() => {
  const f = fixture()
  await f.runtime.getSourceRuntime('A')
  const pending = f.runtime.requestSource('A', 'kw', 'musicUrl', {}, '128k')
  await settle()
  const old = f.actions[0]
  const rejection = assert.rejects(pending, /cancel request/)
  await f.runtime.invalidateSourceRuntimes(['A'])
  await rejection
  await f.runtime.getSourceRuntime('A')
  f.emit({ runtimeId: old.id, action: 'response', data: { requestKey: old.value.requestKey, status: true, result: 'late' } })
  assert.equal(f.native.has(old.id), false)
  assert.equal(f.native.size, 1)
  await f.runtime.invalidateSourceRuntimes()
})
test('runtime pool evicts only idle sources after disposal and remains bounded at three', async() => {
  const f = fixture()
  for (const id of ['A', 'B', 'C', 'D', 'A', 'B']) {
    await f.runtime.getSourceRuntime(id)
    assert.ok(f.native.size <= 3)
  }
  const abort = new AbortController()
  const pending = f.runtime.requestSource('B', 'kw', 'musicUrl', {}, '128k', abort.signal)
  await settle(); abort.abort()
  await assert.rejects(pending, /cancel request/)
  await f.runtime.invalidateSourceRuntimes()
})
