const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const load = require('../../helpers/load-ts-module.cjs')
const { createAccountSession, collectPages, playlistIdentity } = load('src/core/platform/session.ts')
const deferred = () => {
  let complete
  const promise = new Promise(resolve => { complete = resolve })
  return { promise, resolve: complete }
}
const makeStorage = () => {
  const values = new Map()
  return { values, read: async key => values.get(key) ?? null, write: async(key, value) => { values.set(key, value) }, remove: async key => { values.delete(key) } }
}
const account = id => ({ cookie: `token=test-only-${id}`, profile: { id, nickname: id }, updatedAt: 1 })

test('Kugou shielded playlist entries keep distinct identities without becoming playable tracks', async() => {
  const { normalizeKugouSong } = load('src/core/platform/kugou/recommend.ts', {
    '@/utils': { formatPlayTime: String, sizeFormate: String },
    './api': { createKugouApiClient: () => ({}) },
  })
  const first = normalizeKugouSong({ fileid: 11, shield: 1 })
  const second = normalizeKugouSong({ fileid: 12, shield: 1 })
  assert.notEqual(first.id, second.id)
  assert.equal(first.name, '歌曲已被平台屏蔽')
  assert.equal(first.meta.hash, '')
  const all = await collectPages(async() => ({ items: [first, second], total: 2 }), song => song.id)
  assert.equal(all.length, 2)
  assert.throws(() => normalizeKugouSong({}), /资料不完整/)
})

test('new account persists only via the injected secure store and restores after restart', async() => {
  const storage = makeStorage()
  const session = createAccountSession('qq_music', storage)
  await session.initialize()
  await session.save(account('A'), session.generation())
  assert.deepEqual(Object.keys(session.status()).sort(), ['loggedIn', 'profile', 'unavailable'])
  assert.equal(JSON.stringify(session.status()).includes('token'), false)
  const restart = createAccountSession('qq_music', storage)
  await restart.initialize()
  assert.equal(restart.status().profile.id, 'A')
  await restart.logout()
  assert.equal(storage.values.size, 0)
})

test('logout during native encryption cannot resurrect a credential or a private profile', async() => {
  const storage = makeStorage()
  const gate = deferred()
  const entered = deferred()
  storage.write = async(key, value) => { entered.resolve(); await gate.promise; storage.values.set(key, value) }
  const session = createAccountSession('qq_music', storage)
  const save = session.save(account('A'), session.generation())
  await entered.promise
  const logout = session.logout()
  gate.resolve()
  await assert.rejects(save, { name: 'StaleAccountError' })
  await logout
  assert.equal(storage.values.size, 0)
  assert.equal(session.status().loggedIn, false)
})

test('cancelled account switch restores the previous credential without overwriting the next login', async() => {
  const storage = makeStorage()
  const session = createAccountSession('qq_music', storage)
  await session.save(account('A'), 0)
  const gate = deferred()
  const entered = deferred()
  let writes = 0
  storage.write = async(key, value) => {
    if (++writes == 1) { entered.resolve(); await gate.promise }
    storage.values.set(key, value)
  }
  const first = session.save(account('B'), session.invalidate())
  await entered.promise
  const second = session.save(account('C'), session.invalidate())
  gate.resolve()
  await assert.rejects(first, { name: 'StaleAccountError' })
  await second
  assert.equal(session.status().profile.id, 'C')
  assert.equal(JSON.parse(storage.values.get('qq_music')).profile.id, 'C')
})

test('unreadable encrypted credentials never fall back to a logged-in or empty-secret account', async() => {
  const session = createAccountSession('kugou', { read: async() => { throw new Error('Keystore invalidated') }, write: async() => {}, remove: async() => {} })
  await session.initialize()
  assert.deepEqual(session.status(), { loggedIn: false, profile: null, unavailable: true })
})

test('playlist pagination loads 1,207 distinct tracks while deduplicating page overlaps', async() => {
  const calls = []
  const songs = Array.from({ length: 1207 }, (_, id) => ({ id }))
  const result = await collectPages(async page => {
    calls.push(page)
    return { items: songs.slice((page - 1) * 200, page * 200 + 1), total: songs.length }
  }, item => String(item.id))
  assert.equal(result.length, 1207)
  assert.equal(calls.length, 7)
})

test('pagination rejects repeated truncated pages and late account responses', async() => {
  await assert.rejects(collectPages(async() => ({ items: ['a'], total: 2 }), item => item), /分页未完整/)
  await assert.rejects(collectPages(async() => ({ items: ['a'], total: 1 }), item => item, () => false), { name: 'StaleAccountError' })
})

test('account-managed playlist identity separates providers, owners and categories including separator characters', () => {
  const base = { provider: 'netease', accountKey: 'a:b', kind: 'created', id: '123' }
  const ids = [base, { ...base, provider: 'qq_music' }, { ...base, accountKey: 'a' }, { ...base, kind: 'collected' }].map(playlistIdentity)
  assert.equal(new Set(ids).size, ids.length)
  assert.match(ids[0], /a%3Ab/)
})

const hashes = { md5: value => createHash('md5').update(value).digest('hex'), sha256Hex: value => createHash('sha256').update(value).digest('hex'), randomInt: () => 2, randomId: () => 'fixture-id' }
const qqAuth = load('src/core/platform/qq/auth.ts', { '../crypto': hashes })
const qqSign = load('src/core/platform/qq/request.ts', { '../crypto': hashes })
const qqSong = load('src/core/platform/qq/song.ts', { './auth': qqAuth, './request': qqSign, '@/utils': { formatPlayTime: String, sizeFormate: String } })
const qqList = load('src/core/platform/qq/userPlaylists.ts', { './auth': qqAuth, './song': qqSong })
const cookie = 'uin=123; qqmusic_key=fixture'

test('QQ created and collected directories follow actual offsets and do not use account-local dirid as playlist IDs', async() => {
  const offsets = []
  const service = qqList.createQQMusicUserPlaylistService({
    getCookie: () => cookie,
    getProfile: () => ({ uin: '123', nickname: 'Fixture' }),
    fetchImpl: async raw => {
      const url = new URL(raw)
      const offset = Number(url.searchParams.get('sin'))
      offsets.push(offset)
      const created = url.pathname.includes('created')
      return { ok: true, status: 200, json: async() => ({ code: 0, data: created ? { total: 102, disslist: Array.from({ length: offset ? 2 : 100 }, (_, index) => ({ tid: String(offset + index + 1000), dirid: index + 1, diss_name: 'Same name' })) } : { totaldiss: 1, cdlist: [{ dissid: '9876', dissname: 'Collected' }] } }) }
    },
  })
  const list = await service.getUserPlaylists()
  assert.equal(list.length, 103)
  assert.deepEqual(offsets, [0, 100, 0])
  assert.equal(list[0].id, '1000')
  assert.equal(list[102].kind, 'collected')
})

test('QQ account switch mid-directory cannot return old account content', async() => {
  let currentCookie = cookie
  const service = qqList.createQQMusicUserPlaylistService({
    getCookie: () => currentCookie,
    getProfile: () => ({ uin: '123', nickname: '' }),
    fetchImpl: async() => {
      currentCookie = 'uin=456; qqmusic_key=changed'
      return { ok: true, status: 200, json: async() => ({ code: 0, data: { total: 0, disslist: [] } }) }
    },
  })
  await assert.rejects(service.getUserPlaylists(['created']))
})

test('QQ feedback only accepts a successful platform operation result', async() => {
  const { createQQMusicFeedbackService } = load('src/core/platform/qq/feedback.ts', { './auth': qqAuth, './request': qqSign, './song': qqSong })
  const requests = []
  const service = createQQMusicFeedbackService({
    getCookie: () => cookie,
    fetchImpl: async(url, options) => {
      requests.push(JSON.parse(options.body))
      return { ok: true, json: async() => ({ code: 0, req_0: { code: 0, data: { retCode: 1 } } }) }
    },
  })
  await assert.rejects(service.likeMusic({ source: 'tx', meta: { id: 1 } }))
  assert.equal(requests.length, 1)
})

test('Kugou Android and Web signatures keep sorted query/body inputs and stable device identity', async() => {
  const device = { KUGOU_API_MID: '123456789', KUGOU_API_DEV: 'ABCDEF', KUGOU_API_GUID: 'abcdef', KUGOU_API_WEBGL: '42' }
  const calls = []
  const { createKugouApiClient, signKugouParams } = load('src/core/platform/kugou/api.ts', {
    'react-native': { NativeModules: { PlatformCredentials: { kugouRsa: () => 'fixture' } } },
    '../crypto': hashes,
    '../credentials': { getDeviceProfile: async() => device },
    '../http': { platformFetch: async() => {} },
  })
  const api = createKugouApiClient({
    getDevice: async() => device,
    request: async(url, options) => {
      calls.push({ url: new URL(url), options })
      return { status: 200, ok: true, json: async() => ({ status: 1, data: {} }) }
    },
  })
  await api.loginQrKey()
  await api.loginQrCheck({ key: 'fixture-qr' })
  await api.recommendSongs({ cookie: 'userid=7;token=fixture-token' })
  for (const { url, options } of calls) {
    assert.equal(url.searchParams.get('mid'), device.KUGOU_API_MID)
    assert.equal(options.headers.mid, device.KUGOU_API_MID)
    assert.match(options.headers['User-Agent'], /^Android15/)
    const params = Object.fromEntries(url.searchParams)
    const signature = params.signature
    delete params.signature
    assert.equal(signature, signKugouParams(params, options.body ?? '', url.hostname == 'login-user.kugou.com'))
  }
  assert.equal(calls[1].url.searchParams.get('dev'), device.KUGOU_API_DEV)
  assert.equal(JSON.parse(calls[2].options.body).userid, '7')
})

const neteaseModule = (respond, persisted = { value: null }) => load('src/core/netease/index.ts', {
  '@/utils/request': { httpFetch: (url, options) => ({ promise: respond(url, options) }) },
  '@/utils/musicSdk/wy/utils/crypto': { weapi: data => data, eapi: (path, data) => data },
  '@/utils/data': { getNeteaseAccountData: async() => persisted.value, saveNeteaseAccountData: async value => { if (persisted.write) await persisted.write(value); else persisted.value = value } },
  '@/utils': { formatPlayCount: String },
  '@/store/setting/state': { default: { setting: {} } },
  '@/core/platform/credentials': { getDeviceProfile: async() => ({ KUGOU_API_GUID: 'fixture-device' }) },
  '@/core/platform/crypto': hashes,
  './helpers': require('../../../src/core/netease/helpers.js'),
})

test('Netease cancelling while QR check is pending prevents service-side credential persistence', async() => {
  const gate = deferred()
  const persisted = { value: null }
  const service = neteaseModule(async url => {
    if (url.includes('unikey')) return { body: { code: 200, unikey: 'fixture' } }
    if (url.includes('client/login')) return gate.promise
    return { body: { code: 200, profile: { userId: 12, nickname: 'Fixture' } } }
  }, persisted)
  await service.createLoginQr()
  const check = service.checkLoginQr('fixture')
  service.cancelLoginQr()
  gate.resolve({ body: { code: 803, cookie: 'MUSIC_U=fixture' } })
  await assert.rejects(check, /取消/)
  assert.equal(persisted.value, null)
})

test('Netease directory pagination classifies by owner and rejects partial repeated pages', async() => {
  const persisted = { value: { cookie: 'MUSIC_U=fixture', status: { isLoggedIn: true, profile: { userId: 12, nickname: 'Fixture' } }, updatedAt: 1 } }
  const offsets = []
  const service = neteaseModule(async(url, options) => {
    offsets.push(options.form.offset)
    return { body: { code: 200, more: options.form.offset == 0, playlist: options.form.offset == 0 ? [{ id: 1, name: 'A', creator: { userId: 12 } }] : [{ id: 2, name: 'A', creator: { userId: 99 } }] } }
  }, persisted)
  const items = await service.getUserPlaylists()
  assert.deepEqual(offsets, [0, 100])
  assert.deepEqual(items.map(item => item.kind), ['created', 'collected'])
  const broken = neteaseModule(async() => ({ body: { code: 200, more: true, playlist: [{ id: 1, creator: { userId: 12 } }] } }), persisted)
  await assert.rejects(broken.getUserPlaylists(), /分页未完整/)
})

test('Netease status refresh started during logout waits for erasure instead of resurrecting the old cookie', async() => {
  const gate = deferred()
  const persisted = { value: { cookie: 'MUSIC_U=fixture', status: { isLoggedIn: true, profile: { userId: 12 } }, updatedAt: Date.now() } }
  persisted.write = async value => { await gate.promise; persisted.value = value }
  const service = neteaseModule(async() => ({ body: { code: 200 } }), persisted)
  const logout = service.logout()
  const status = service.getAccountStatus()
  gate.resolve()
  await logout
  assert.deepEqual(await status, { isLoggedIn: false, profile: null })
  assert.equal(persisted.value.cookie, '')
})

test('managed catalog preserves cached content on partial failure and isolates another account with the same list ID', async() => {
  const saved = new Map()
  let user = 'A'
  let epoch = 0
  let fail = false
  let calls = 0
  const { cachedPlatformPlaylists, refreshPlatformPlaylists } = load('src/core/platform/catalog.ts', {
    '@/utils/atomicSnapshot': { createAtomicSnapshot: key => ({ read: async() => saved.get(key), write: async value => { saved.set(key, value) } }) },
    './session': { collectPages, playlistIdentity },
    './index': {
      generation: () => epoch,
      assertGeneration: (provider, expected) => { if (expected != epoch) throw new Error('stale') },
      getPlatformStatus: () => ({ profile: { id: user } }),
      getPlatformPlaylists: async(provider, kind) => {
        calls++
        if (fail) throw new Error('second page failed')
        return [{ provider, accountKey: user, kind, id: 'same-id', sourceListId: 'same-id', name: user }]
      },
    },
  })
  await Promise.all([refreshPlatformPlaylists('netease', 'created'), refreshPlatformPlaylists('netease', 'created')])
  assert.equal(calls, 1)
  fail = true
  await assert.rejects(refreshPlatformPlaylists('netease', 'created'), /second page failed/)
  assert.equal((await cachedPlatformPlaylists('netease', 'created'))[0].name, 'A')
  user = 'B'
  epoch++
  assert.deepEqual(await cachedPlatformPlaylists('netease', 'created'), [])
  fail = false
  await refreshPlatformPlaylists('netease', 'created')
  assert.equal((await cachedPlatformPlaylists('netease', 'created'))[0].name, 'B')
  user = 'A'
  epoch++
  assert.equal((await cachedPlatformPlaylists('netease', 'created'))[0].name, 'A')
})

test('Netease pending preview cannot replace a newly started QQ continuous queue', async() => {
  const gate = deferred()
  const state = { isPrivateFmActive: false, privateFmMode: 'DEFAULT', privateFmList: [], isLoadingPrivateFm: false }
  const writes = []
  global.state_event = { privateFmUpdated: () => {} }
  const radio = load('src/store/privateFm/action.ts', {
    '@/core/netease': { getPrivateFm: async() => gate.promise },
    '@/core/list': { setTempList: async(id, songs) => { writes.push(songs) } },
    '@/core/player/player': { playList: async() => {} },
    './state': state,
    '@/config/constant': { LIST_IDS: { TEMP: 'temp' } },
    './helpers': { appendUniqueMusicInfos: (a, b) => [...a, ...b], getMusicIdentity: item => item.id },
  })
  const preview = radio.preparePrivateFmQueue()
  const songs = [{ id: 'QQ-1', source: 'tx' }]
  await radio.enterPlatformRadio({ provider: 'qq_music', current: () => true, load: async() => [] }, songs)
  gate.resolve([{ id: 'WY-1', source: 'wy' }])
  await preview
  assert.equal(state.privateFmList[0].id, 'QQ-1')
  assert.equal(writes.length, 1)
})

test('late QQ continuous recommendations cannot append after leaving that account', async() => {
  const gate = deferred()
  const state = { isPrivateFmActive: false, privateFmMode: 'DEFAULT', privateFmList: [], isLoadingPrivateFm: false }
  const writes = []
  global.state_event = { privateFmUpdated: () => {} }
  const radio = load('src/store/privateFm/action.ts', {
    '@/core/netease': {},
    '@/core/list': { setTempList: async(id, songs) => { writes.push(songs) } },
    '@/core/player/player': { playList: async() => {} },
    './state': state,
    '@/config/constant': { LIST_IDS: { TEMP: 'temp' } },
    './helpers': { appendUniqueMusicInfos: (a, b) => [...a, ...b], getMusicIdentity: item => item.id },
  })
  const first = { id: 'QQ-1', source: 'tx' }
  await radio.enterPlatformRadio({ provider: 'qq_music', current: () => true, load: async() => gate.promise }, [first])
  const append = radio.ensurePrivateFmNextSongs(first)
  radio.exitPlatformRadio('qq_music')
  gate.resolve([{ id: 'QQ-old-response', source: 'tx' }])
  await append
  assert.equal(writes.length, 1)
  assert.equal(state.isPrivateFmActive, false)
})

const loadPlatform = (storage, native, options = {}) => load('src/core/platform/index.ts', {
  'react-native': { NativeModules: { PlatformLogin: native } },
  './session': { ...load('src/core/platform/session.ts') },
  './credentials': { credentialStorage: storage },
  './http': { platformFetch: async() => {} },
  './qq/auth': qqAuth,
  './qq/song': { createQQMusicSongService: () => ({}) },
  './qq/dailyRecommend': { createQQMusicDailyRecommendService: () => ({}) },
  './qq/homeRecommend': { createQQMusicHomeRecommendService: () => ({}) },
  './qq/playlistDetail': { createQQMusicPlaylistDetailService: () => ({}) },
  './qq/userPlaylists': { createQQMusicUserPlaylistService: () => ({ getUserPlaylists: async() => [] }) },
  './qq/feedback': { createQQMusicFeedbackService: () => ({}) },
  './qq/credential': { createQQMusicCredentialService: () => ({ getRefreshDueAt: () => null, refresh: options.refresh ?? (async cookie => cookie) }) },
  './kugou/api': { createKugouApiClient: () => ({}) },
  './kugou/recommend': { createKugouRecommendationService: () => ({}) },
  './kugou/userPlaylists': { createKugouUserPlaylistService: () => ({}) },
  '@/core/netease': {},
  '@/store/netease/action': {},
  '@/utils/musicSdk': {},
  '@/core/netease/helpers': {},
  '@/utils': {},
})

test('closing QQ login during secure-store initialization prevents opening a late native authorization window', async() => {
  const storage = makeStorage()
  const gate = deferred()
  storage.read = async() => gate.promise
  let windows = 0
  const platform = loadPlatform(storage, { openQQ: async() => { windows++; return cookie }, cancel: async() => {} })
  const pending = platform.loginQQ()
  await platform.cancelPlatformLogin('qq_music')
  gate.resolve(null)
  await assert.rejects(pending, { name: 'StaleAccountError' })
  assert.equal(windows, 0)
  assert.equal(storage.values.size, 0)
})

test('completed QQ login survives login-component cleanup, while logout removes that credential', async() => {
  const storage = makeStorage()
  const platform = loadPlatform(storage, { openQQ: async() => cookie, cancel: async() => {} })
  await platform.loginQQ()
  const before = platform.generation('qq_music')
  await platform.cancelPlatformLogin('qq_music')
  assert.equal(platform.generation('qq_music'), before)
  assert.equal(platform.getPlatformStatus('qq_music').profile.id, '123')
  await platform.logoutPlatform('qq_music')
  assert.equal(storage.values.size, 0)
  assert.equal(platform.getPlatformStatus('qq_music').loggedIn, false)
})

test('late auth failure after account replacement cannot clear the new account', async() => {
  const storage = makeStorage()
  let nextCookie = cookie
  const platform = loadPlatform(storage, { openQQ: async() => nextCookie, cancel: async() => {} })
  await platform.loginQQ()
  const gate = deferred()
  const pending = platform.accountCall('qq_music', async() => { await gate.promise; throw new qqSong.QQMusicAuthError() })
  await platform.logoutPlatform('qq_music')
  nextCookie = 'uin=456; qqmusic_key=fixture-second'
  await platform.loginQQ()
  gate.resolve()
  await assert.rejects(pending, { name: 'StaleAccountError' })
  assert.equal(platform.getPlatformStatus('qq_music').profile.id, '456')
})

test('platform fetch keeps explicit credentials out of the persistent native cookie jar and configures QQ origin', async() => {
  const original = global.fetch
  let captured
  global.fetch = async(url, options) => { captured = options; return { ok: true } }
  try {
    const { platformFetch } = load('src/core/platform/http.ts')
    await platformFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', { headers: { Cookie: cookie } })
    assert.equal(captured.credentials, 'omit')
    assert.equal(captured.headers.get('Cookie'), cookie)
    assert.equal(captured.headers.get('Origin'), 'https://y.qq.com')
    assert.equal(captured.headers.get('Referer'), 'https://y.qq.com/')
    assert.match(captured.headers.get('User-Agent'), /QQMusic\/21\.16/)
  } finally { global.fetch = original }
})
