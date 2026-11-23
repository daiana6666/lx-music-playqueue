const test = require('node:test')
const assert = require('node:assert/strict')
const { createLatestAsyncValue } = require('../../src/utils/latestAsyncValue.js')

test('a late storage load cannot overwrite a newer user selection', async() => {
  let resolveLoad
  const holder = createLatestAsyncValue(
    () => new Promise(resolve => { resolveLoad = resolve }),
    value => value ?? 'default',
  )
  const loading = holder.get()
  holder.set('love')
  resolveLoad('default')
  assert.equal(await loading, 'love')
  assert.equal(await holder.get(), 'love')
})
