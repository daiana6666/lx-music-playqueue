const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('../../helpers/load-ts-module.cjs')

test('both schemes dispatch supported routes and preserve encoded query data; unsupported links have no action', async() => {
  let listener
  const calls = []
  const errors = []
  const api = load('src/core/init/deeplink/index.ts', {
    'react-native': { Linking: { addEventListener: (_name, fn) => { listener = fn }, getInitialURL: async() => null } },
    './utils': { errorDialog: error => errors.push(error) },
    './musicAction': { handleMusicAction: async(...args) => calls.push(['music', ...args]) },
    './songlistAction': { handleSonglistAction: async(...args) => calls.push(['songlist', ...args]) },
    './playerAction': { handlePlayerAction: async(...args) => calls.push(['player', ...args]) },
    '@/utils/fs': { stat: async path => ({ name: path }), extname: name => name.split('.').at(-1) },
    './fileAction': { handleFileLXMCAction: async file => calls.push(['file', file.name]) },
  })
  await api.initDeeplink()
  const send = async url => { listener({ url }); await new Promise(resolve => setImmediate(resolve)) }
  await send('starkylx://music/searchPlay?q=a=b?c&__proto__=bad&data=' + encodeURIComponent(JSON.stringify({ name: '中文' })))
  assert.equal(calls[0][2].q, 'a=b?c')
  assert.equal(Object.hasOwn(calls[0][2], '__proto__'), false)
  assert.deepEqual(calls[0][2].data, { name: '中文' })
  await send('lxmusic://player/pause')
  await send('starkylx://songlist/play/wy/123')
  await send('content://provider/backup.SLXMC')
  assert.deepEqual(calls.slice(1).map(call => call[0]), ['player', 'songlist', 'file'])
  await send('starkylx://player/delete')
  await send('lxmusic://unknown/play')
  await send('starkylx://music/play?data=%zz')
  assert.equal(calls.length, 4)
  assert.equal(errors.length, 3)
})

test('profile sync is negotiated only when the peer supports both list and profile versions', async() => {
  const handler = load('src/plugins/sync/client/sync/handler.ts', { '../modules': { featureVersion: { list: 1, dislike: 1, party: 1, userApi: 2, listProfile: 1 } } }).default
  for (const peer of [{ list: 1 }, { list: 1, listProfile: 2 }, { list: 2, listProfile: 1 }]) {
    assert.equal((await handler.getEnabledFeatures({}, 'desktop-app', peer)).listProfile, undefined)
  }
  assert.deepEqual((await handler.getEnabledFeatures({}, 'desktop-app', { list: 1, listProfile: 1 })).listProfile, {})
})
