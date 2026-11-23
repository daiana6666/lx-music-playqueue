const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('../../helpers/load-ts-module.cjs')
const { createPlaybackCoordinator, resolveInOrder } = load('src/core/music/playbackSession.ts')
const stats = require('../../../src/core/netease/helpers.js')
const backup = require('../../../src/core/backup/fullHelpers.js')
const song = { id: '1', source: 'kw', name: 'Test song', singer: 'Artist', meta: { songId: '1', albumName: '', _qualitys: {}, qualitys: [] } }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { resolve, promise } }

test('source attempts are serial and invalid media advances to the next enabled source', async() => {
  const calls = []
  const value = await resolveInOrder(['A', 'A', 'B', 'C'], async id => { calls.push(id); if (id == 'A') throw new Error('invalid media'); return id })
  assert.equal(value, 'B')
  assert.deepEqual(calls, ['A', 'B'])
})
test('late cancelled resolution is rejected and cannot start the next source', async() => {
  const controller = new AbortController()
  const result = deferred()
  const calls = []
  const operation = resolveInOrder(['A', 'B'], async id => { calls.push(id); return result.promise }, controller.signal)
  controller.abort(); result.resolve('late URL')
  await assert.rejects(operation, /cancel request/)
  assert.deepEqual(calls, ['A'])
})
test('play and preload lanes cancel independently and caches require proof and current account generation', () => {
  const service = createPlaybackCoordinator()
  const play = service.begin('play')
  const preload = service.begin('preload')
  service.begin('preload')
  assert.equal(play.aborted, false)
  assert.equal(preload.aborted, true)
  const value = { url: 'https://example.test/audio', quality: '128k', validated: false }
  assert.equal(service.commit('A:account1:song:flac', value, 0, play, 0), false)
  value.validated = true
  assert.equal(service.commit('A:account1:song:flac', value, 0, play, 0), true)
  assert.equal(service.read('A:account1:song:flac', 1).quality, '128k')
  assert.equal(service.read('B:account1:song:flac', 1), null)
  assert.equal(service.read('A:account2:song:flac', 1), null)
  assert.equal(service.read('A:account1:song:flac', 600001), null)
  service.invalidate()
  assert.equal(play.aborted, true)
  assert.equal(service.commit('old', value, 0), false)
})
test('accepted playback counts once across pause resume duplicate callback midnight and process recovery', () => {
  let data = stats.createDefaultListeningTimeStats()
  stats.beginListeningSession(data, song, false, 'session1')
  assert.equal(stats.acceptListeningSession(data, song, 'session1', new Date(2026, 8, 11, 23, 59, 59)), true)
  stats.addListeningTime(data, 2, song, new Date(2026, 8, 12))
  assert.equal(stats.acceptListeningSession(data, song, 'session1', new Date(2026, 8, 12)), false)
  data = stats.normalizeListeningTimeStats(JSON.parse(JSON.stringify(data)))
  stats.beginListeningSession(data, song, true, 'unused')
  assert.equal(stats.acceptListeningSession(data, song, 'session1'), false)
  assert.equal(data.totalPlayCount, 1)
  assert.equal(data.songs['kw:1'].playCount, 1)
  assert.equal(data.totalSeconds, 2)
  stats.beginListeningSession(data, song, false, 'manualReplay')
  assert.equal(stats.acceptListeningSession(data, song, 'session1'), false)
  assert.equal(stats.acceptListeningSession(data, song, 'manualReplay'), true)
  assert.equal(data.totalPlayCount, 2)
})
test('legacy durations remain intact and do not generate historical counts', () => {
  const data = stats.normalizeListeningTimeStats({ totalSeconds: 700, daily: { '2026-09-10': 700 }, songs: { 'kw:1': { ...song, seconds: 700 } } })
  assert.equal(data.totalSeconds, 700)
  assert.equal(data.totalPlayCount, 0)
  assert.equal(data.songs['kw:1'].playCount, 0)
  assert.ok(data.countStartedAt > 0)
})
test('settings exports omit secrets and desktop settings cannot overwrite Android paths', () => {
  const current = { version: '2.6', 'player.playQuality': '128k', 'webdav.password': 'secret', 'webdav.url': 'https://dav.test/', 'download.savePath': '/device/music', 'common.apiSource': 'user_api_a', 'player.fallbackSources': ['user_api_b'] }
  const safe = backup.portableSettings(current)
  assert.equal(JSON.stringify(safe).includes('secret'), false)
  assert.equal(Object.hasOwn(safe, 'webdav.url'), false)
  const mapped = backup.mapSettings({ 'player.playQuality': 'flac', 'download.savePath': 'C:/music', 'webdav.password': 'injected', 'window.width': 800 }, current)
  assert.equal(mapped['download.savePath'], '/device/music')
  assert.equal(mapped['player.playQuality'], 'flac')
  assert.equal(mapped['webdav.password'], '')
  assert.equal(mapped['common.apiSource'], 'user_api_a')
})
test('full restore validates before writes and cannot grant account authority or inject secret rows', () => {
  const value = { type: 'allData_v2', setting: {}, playList: [{ id: 'default', name: 'Default', list: [song], profile: { group: 'mine', owner: 'injected', cookie: 'injected' }, managedAccount: 'injected' }], mobile: { version: 1, userApis: [], recentPlay: [song], listeningTime: stats.createDefaultListeningTimeStats() } }
  const rows = backup.prepareFullRestore(value, {})
  assert.equal(JSON.stringify(rows).includes('injected'), false)
  assert.ok(rows.some(([key]) => key == '@recent_play_list'))
  assert.ok(rows.some(([key]) => key == '@listening_time_stats'))
  assert.throws(() => backup.prepareFullRestore({ ...value, mobile: { ...value.mobile, version: 999 } }, {}), /版本/)
  assert.throws(() => backup.prepareFullRestore({ ...value, playList: [{ ...value.playList[0], list: [{ id: 'bad' }] }] }, {}), /Invalid song/)
})

test('full backup restore retains source provenance for the next desktop synchronization', () => {
  const api = { id: 'user_api_sync_A', name: 'A', description: '', author: '', homepage: '', version: '1', script: '/* source */', remoteId: 'user_api_A', remoteSource: 'desktop', allowShowUpdateAlert: false }
  const value = { type: 'allData_v2', setting: {}, playList: [], mobile: { version: 1, userApis: [api], recentPlay: [], listeningTime: stats.createDefaultListeningTimeStats() } }
  const rows = backup.prepareFullRestore(value, {})
  const restored = rows.find(([key]) => key == '@user_api_catalog_v1')[1].apis[0]
  assert.equal(restored.remoteId, api.remoteId)
  assert.equal(restored.remoteSource, 'desktop')
  assert.equal(restored.allowShowUpdateAlert, false)
})

const storageFixture = (options = {}) => {
  const old = new Map(Object.entries(options.old ?? { '@setting_v1': JSON.stringify({ 'webdav.password': 'legacy-password', 'player.volume': 0.8 }), '@netease_account': JSON.stringify({ cookie: 'legacy-cookie' }), '@sync_auth_key': JSON.stringify({ server: { key: 'legacy-key' } }), '@playlist_profiles_v1': '@playlist_profiles_v1:g1', '@playlist_profiles_v1:g1': JSON.stringify({ profiles: { default: { description: 'kept' } } }) }))
  const data = new Map(); const recovery = new Map(); const secrets = new Map()
  let initialized = false; let failMigration = false; let failCredential = false
  const native = {
    initialized: async() => initialized,
    migrate: async rows => { if (failMigration) throw new Error('injected interruption'); for (const [key, value] of rows) { data.set(key, value); recovery.set(key, value) } initialized = true },
    read: async key => data.get(key) ?? null, keys: async() => [...data.keys()],
    write: async(rows, removals, snapshot) => { if (snapshot) { recovery.clear(); for (const row of data) recovery.set(...row) } for (const key of removals) data.delete(key); for (const row of rows) data.set(...row) },
    recover: async() => { data.clear(); for (const row of recovery) data.set(...row) },
    scrub: async key => { recovery.delete(key); if (data.has(key)) recovery.set(key, data.get(key)) },
  }
  const api = load('src/plugins/storage.ts', {
    'react-native': { NativeModules: { UserData: native } },
    './legacyStorage': { getAllKeys: async() => [...old.keys()], getData: async key => old.has(key) ? JSON.parse(old.get(key)) : null, removeData: async key => { old.delete(key) } },
    '@react-native-async-storage/async-storage': { getItem: async key => old.get(key) ?? null },
    '@/core/platform/credentials': { credentialStorage: { read: async key => secrets.get(key) ?? null, write: async(key, value) => { if (failCredential) throw new Error('keystore unavailable'); secrets.set(key, value) } } },
  })
  return { api, old, data, recovery, secrets, failMigration: value => { failMigration = value }, failCredential: value => { failCredential = value } }
}
test('interrupted upgrade preserves legacy data and restarts migration with resolved atomic pointers', async() => {
  const env = storageFixture()
  env.failMigration(true)
  await assert.rejects(env.api.initializeStorage(), /interruption/)
  assert.equal(env.data.size, 0)
  assert.ok(env.old.has('@playlist_profiles_v1'))
  env.failMigration(false)
  await env.api.initializeStorage()
  assert.equal((await env.api.getData('@playlist_profiles_v1')).profiles.default.description, 'kept')
  await env.api.saveData('new', [1, 2, 3])
  await env.api.initializeStorage()
  assert.deepEqual(await env.api.getData('new'), [1, 2, 3])
})
test('credentials are verified before deleting old fields and recovery never reintroduces secrets', async() => {
  const env = storageFixture()
  env.failCredential(true)
  await assert.rejects(env.api.getData('@netease_account'), /keystore/)
  assert.ok(env.old.has('@netease_account'))
  assert.ok(env.data.has('@netease_account'))
  env.failCredential(false)
  assert.equal((await env.api.getData('@netease_account')).cookie, 'legacy-cookie')
  assert.equal(env.old.has('@netease_account'), false)
  assert.equal(env.recovery.has('@netease_account'), false)
  assert.equal((await env.api.getData('@setting_v1'))['webdav.password'], 'legacy-password')
  assert.equal(env.data.get('@setting_v1').includes('legacy-password'), false)
  assert.equal(env.recovery.get('@setting_v1').includes('legacy-password'), false)
  env.secrets.delete('netease')
  await assert.rejects(env.api.getData('@netease_account'), /重新登录/)
})
test('restore has a recovery snapshot and suspends stale writes until restart', async() => {
  const env = storageFixture({ old: { '@list__default': JSON.stringify([song]) } })
  await env.api.restoreData([['@list__default', []]])
  await env.api.saveData('@list__default', ['stale'])
  assert.deepEqual(await env.api.getData('@list__default'), [])
  await env.api.recoverData()
  assert.equal((await env.api.getData('@list__default'))[0].id, '1')
})
