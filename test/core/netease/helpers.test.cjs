const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getDailySongCategoryTagKey,
  parseDailySongCategoryTagKey,
  getDailySongCategoryPlaylistId,
  parseDailySongCategoryPlaylistId,
  collectDailySongSeedCards,
  resolveDailySongCategoryTagKeys,
  normalizeRecommendHomeSectionOrder,
  moveRecommendHomeSection,
  createRecentPlayList,
  normalizeRecentPlayList,
  createDefaultListeningTimeStats,
  normalizeListeningTimeStats,
  addListeningTime,
  createNeteaseEapiHeader,
  createNeteaseEapiCookie,
  createLoginQrKeyPayload,
  createLoginQrCheckPayload,
  createLoginQrUrl,
  createLoginQrImage,
  createLoginQrRenderSpec,
  createNeteasePcDeviceId,
  NETEASE_PC_EAPI_USER_AGENT,
  normalizeNeteaseSong,
  normalizeHomepagePlaylistResource,
  mergeNeteasePlaylists,
  applyPlaylistSummary,
  buildRecommendSpecialCards,
  mergeNeteaseCookies,
  shouldContinueLoginQrPolling,
  PRIVATE_RADAR_PLAYLIST_ID,
  PRIVATE_FM_CARD_ID,
} = require('../../../src/core/netease/helpers.js')

test('daily song category tag and playlist IDs round trip', () => {
  assert.equal(getDailySongCategoryTagKey('10', '20'), '10:20')
  assert.deepEqual(parseDailySongCategoryTagKey('10:20'), { categoryId: '10', tagId: '20' })
  assert.equal(getDailySongCategoryPlaylistId('10', '20'), 'daily_song_category__10__20')
  assert.deepEqual(parseDailySongCategoryPlaylistId('daily_song_category__10__20'), { categoryId: '10', tagId: '20' })
  assert.equal(parseDailySongCategoryPlaylistId('normal__10__20'), null)
})

test('daily song category tag keys resolve defaults explicit order and hidden state', () => {
  const categories = [
    {
      categoryId: '1',
      tags: [
        { categoryId: '1', tagId: '11' },
        { categoryId: '1', tagId: '12' },
      ],
    },
    {
      categoryId: '2',
      tags: [
        { categoryId: '2', tagId: '21' },
        { categoryId: '2', tagId: '22' },
      ],
    },
  ]

  assert.deepEqual(resolveDailySongCategoryTagKeys(categories, null, 3), ['1:11', '1:12'])
  assert.deepEqual(resolveDailySongCategoryTagKeys(categories, [], 3), [])
  assert.deepEqual(resolveDailySongCategoryTagKeys(categories, ['2:22', 'bad', '1:11', '2:22'], 3), ['2:22', '1:11'])
})

test('daily song category tag keys default to the first six desktop-style tags', () => {
  const categories = [
    {
      categoryId: '1',
      tags: [
        { categoryId: '1', tagId: '11' },
        { categoryId: '1', tagId: '12' },
        { categoryId: '1', tagId: '13' },
        { categoryId: '1', tagId: '14' },
        { categoryId: '1', tagId: '15' },
        { categoryId: '1', tagId: '16' },
        { categoryId: '1', tagId: '17' },
      ],
    },
    {
      categoryId: '2',
      tags: [
        { categoryId: '2', tagId: '21' },
        { categoryId: '2', tagId: '22' },
        { categoryId: '2', tagId: '23' },
        { categoryId: '2', tagId: '24' },
      ],
    },
  ]

  assert.deepEqual(resolveDailySongCategoryTagKeys(categories, null), ['1:11', '1:12', '1:13', '1:14', '1:15', '1:16'])
})

test('daily song seed cards are collected from desktop homepage blocks', () => {
  const seedMap = new Map()
  collectDailySongSeedCards({
    blocks: [
      {
        categoryId: 10,
        tagId: 20,
        songId: 100,
      },
      {
        playBtnData: {
          playOrpheus: 'orpheus://song?categoryId=10&tagId=20&songId=100,101,102',
        },
      },
      {
        resourceExtInfo: {
          extData: {
            categoryId: 30,
            tagId: 40,
            rcmdData: [{ id: 300 }, { songId: 301 }],
          },
        },
      },
    ],
  }, seedMap)

  assert.equal(seedMap.get('10:20'), '100,101,102')
  assert.equal(seedMap.get('30:40'), '300,301')
})

test('recommend home section order is normalized and movable', () => {
  const defaultOrder = ['radarPlaylists', 'styleSongs', 'dailySongCategories', 'similarSongs', 'recommendPlaylists', 'charts']
  assert.deepEqual(normalizeRecommendHomeSectionOrder(['charts', 'unknown', 'charts', 'styleSongs']), [
    'charts',
    'styleSongs',
    'radarPlaylists',
    'dailySongCategories',
    'similarSongs',
    'recommendPlaylists',
  ])
  assert.deepEqual(moveRecommendHomeSection(defaultOrder, 'styleSongs', -1), [
    'styleSongs',
    'radarPlaylists',
    'dailySongCategories',
    'similarSongs',
    'recommendPlaylists',
    'charts',
  ])
  assert.deepEqual(moveRecommendHomeSection(defaultOrder, 'radarPlaylists', -1), defaultOrder)
})

test('recent play de-duplicates by source identity and caps length', () => {
  const a = { id: '1', source: 'wy', name: 'A', singer: 'S' }
  const b = { id: '1', source: 'kw', name: 'A', singer: 'S' }
  const next = createRecentPlayList([a, b], a, 2)
  assert.deepEqual(next.map(item => `${item.source}:${item.id}`), ['wy:1', 'kw:1'])
  const capped = createRecentPlayList([a, b], { id: '2', source: 'kg', name: 'C', singer: 'D' }, 2)
  assert.deepEqual(capped.map(item => `${item.source}:${item.id}`), ['kg:2', 'wy:1'])
})

test('recent play and listening stats discard malformed persisted values', () => {
  const validMusic = {
    id: '1',
    source: 'kw',
    name: 'Song',
    singer: 'Singer',
    meta: { albumName: '' },
  }
  assert.deepEqual(normalizeRecentPlayList([null, validMusic, { ...validMusic }, { id: 2 }]), [validMusic])
  assert.deepEqual(normalizeRecentPlayList({}), [])

  const stats = normalizeListeningTimeStats({
    totalSeconds: '12',
    daily: { '2026-07-21': '5', invalid: 'nope' },
    songs: {
      'kw:1': { id: '1', source: 'kw', name: 'Song', singer: 'Singer', seconds: '7' },
      invalid: { id: '', seconds: 100 },
    },
    updatedAt: 123,
  })
  assert.equal(stats.totalSeconds, 12)
  assert.deepEqual(stats.daily, { '2026-07-21': 5 })
  assert.deepEqual(stats.songs, {
    'kw:1': { id: '1', source: 'kw', name: 'Song', singer: 'Singer', seconds: 7, playCount: 0 },
  })
})

test('listening time accumulates total daily and song stats', () => {
  const stats = createDefaultListeningTimeStats()
  addListeningTime(stats, 65, { id: '1', source: 'wy', name: 'A', singer: 'S' }, new Date('2026-05-31T09:00:00+08:00'))
  addListeningTime(stats, 5, { id: '1', source: 'wy', name: 'A2', singer: 'S2' }, new Date('2026-05-31T09:01:00+08:00'))
  assert.equal(stats.totalSeconds, 70)
  assert.equal(stats.daily['2026-05-31'], 70)
  assert.equal(stats.songs['wy:1'].seconds, 70)
  assert.equal(stats.songs['wy:1'].name, 'A2')
})

test('desktop qr login payloads match enhanced netease api modules', () => {
  const header = createNeteaseEapiHeader({
    now: 1700000000123,
    random: 7,
    deviceId: 'device-id',
  })

  assert.deepEqual(header, {
    osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
    deviceId: 'device-id',
    os: 'pc',
    appver: '3.1.17.204416',
    versioncode: '140',
    mobilename: '',
    buildver: '1700000000',
    resolution: '1920x1080',
    __csrf: '',
    channel: 'netease',
    requestId: '1700000000123_0007',
  })
  assert.deepEqual(createLoginQrKeyPayload(header), {
    type: 3,
    header,
  })
  assert.deepEqual(createLoginQrCheckPayload('qr-key', header), {
    key: 'qr-key',
    type: 3,
    header,
  })
  assert.equal(
    createNeteaseEapiCookie(header),
    'osver=Microsoft-Windows-10-Professional-build-19045-64bit; deviceId=device-id; os=pc; appver=3.1.17.204416; versioncode=140; mobilename=; buildver=1700000000; resolution=1920x1080; __csrf=; channel=netease; requestId=1700000000123_0007',
  )
})

test('desktop qr login creates scan-friendly qr artwork', () => {
  const qrurl = createLoginQrUrl('qr-key')
  assert.equal(qrurl, 'https://music.163.com/login?codekey=qr-key')

  const qrimg = createLoginQrImage(qrurl, { cellSize: 6, margin: 4 })
  assert.match(qrimg, /^data:image\/gif;base64,/)

  const spec = createLoginQrRenderSpec(qrurl, { maxSize: 220, margin: 4 })
  assert.equal(spec.margin, 4)
  assert.equal(Number.isInteger(spec.cellSize), true)
  assert.equal(spec.renderSize, spec.size * spec.cellSize)
  assert.ok(spec.renderSize <= 220)
  assert.equal(spec.modules.length, spec.size)
  assert.equal(spec.modules.every(row => row.length == spec.size), true)
  assert.equal(spec.modules[0].some(Boolean), false)
  assert.equal(spec.modules.at(-1).some(Boolean), false)
  assert.equal(spec.modules.some(row => row[0]), false)
  assert.equal(spec.modules.some(row => row.at(-1)), false)
})

test('desktop qr login uses a desktop client device profile', () => {
  const randomValues = [0, 0.0625, 0.5, 0.999]
  let index = 0
  const deviceId = createNeteasePcDeviceId(() => {
    const value = randomValues[index % randomValues.length]
    index += 1
    return value
  })

  assert.equal(deviceId.length, 52)
  assert.match(deviceId, /^[0-9A-F]{52}$/)
  assert.equal(deviceId.startsWith('lx_mobile'), false)
  assert.match(NETEASE_PC_EAPI_USER_AGENT, /Windows NT 10\.0/)
  assert.match(NETEASE_PC_EAPI_USER_AGENT, /NeteaseMusicDesktop/)

  const header = createNeteaseEapiHeader({ now: 1700000000123, random: 7, deviceId })
  assert.equal(header.os, 'pc')
  assert.equal(header.deviceId, deviceId)
  assert.equal(header.channel, 'netease')
})

test('desktop eapi header carries login cookies when present', () => {
  const header = createNeteaseEapiHeader({
    now: 1700000000123,
    random: 7,
    deviceId: 'device-id',
    cookie: {
      MUSIC_U: 'music-u-token',
      MUSIC_A: 'music-a-token',
    },
  })

  assert.equal(header.os, 'pc')
  assert.equal(header.MUSIC_U, 'music-u-token')
  assert.equal(header.MUSIC_A, 'music-a-token')
  assert.match(createNeteaseEapiCookie(header), /MUSIC_U=music-u-token/)
})

test('homepage playlist resources use desktop block image and creator fields', () => {
  const playlist = normalizeHomepagePlaylistResource({
    resourceId: 3136952023,
    uiElement: {
      mainTitle: { title: '私人雷达' },
      image: { imageWithoutTextUrl: 'https://img.example/radar.jpg' },
      subTitle: { title: '为你更新' },
    },
    resourceExtInfo: {
      playCount: 123456,
      trackCount: 42,
      creator: { nickname: '网易云音乐' },
    },
  }, count => `plays:${count}`)

  assert.deepEqual(playlist, {
    id: PRIVATE_RADAR_PLAYLIST_ID,
    name: '私人雷达',
    img: 'https://img.example/radar.jpg',
    author: '网易云音乐',
    play_count: 'plays:123456',
    desc: '为你更新',
    source: 'wy',
    total: '42',
  })
})

test('playlist merge and summary hydration keep desktop order and fill missing covers', () => {
  const merged = mergeNeteasePlaylists([
    { id: '1', name: 'First', img: '', author: '', play_count: '', desc: null, source: 'wy' },
    { id: '2', name: 'Second', img: 'two.jpg', author: '', play_count: '', desc: null, source: 'wy' },
    { id: '1', name: 'Duplicate', img: 'duplicate.jpg', author: '', play_count: '', desc: null, source: 'wy' },
  ])
  assert.deepEqual(merged.map(item => item.id), ['1', '2'])

  assert.deepEqual(applyPlaylistSummary(merged[0], {
    id: '1',
    name: 'Filled',
    img: 'one.jpg',
    author: 'Author',
    play_count: '1万',
    desc: 'desc',
    source: 'wy',
    total: '10',
  }), {
    id: '1',
    name: 'First',
    img: 'one.jpg',
    author: 'Author',
    play_count: '1万',
    desc: 'desc',
    source: 'wy',
    total: '10',
  })
})

test('recommend special cards mirror desktop daily fm and radar data', () => {
  const dailySong = {
    id: 'wy_1',
    name: 'Daily Song',
    singer: 'Daily Singer',
    source: 'wy',
    interval: '03:00',
    meta: { picUrl: 'daily.jpg' },
  }
  const fmSong = {
    id: 'wy_2',
    name: 'FM Song',
    singer: 'FM Singer',
    source: 'wy',
    interval: '04:00',
    meta: { picUrl: 'fm.jpg' },
  }
  const radar = {
    id: PRIVATE_RADAR_PLAYLIST_ID,
    name: '私人雷达',
    img: 'radar.jpg',
    author: '网易云音乐',
    play_count: '',
    desc: null,
    source: 'wy',
  }

  const cards = buildRecommendSpecialCards({
    dailySongs: [dailySong],
    privateFmSongs: [fmSong],
    recommendPlaylists: [radar],
  })

  assert.deepEqual(cards.map(item => item.id), ['wy_daily_recommend', PRIVATE_FM_CARD_ID, PRIVATE_RADAR_PLAYLIST_ID])
  assert.equal(cards[0].img, 'daily.jpg')
  assert.equal(cards[0].desc, '从《Daily Song》开始')
  assert.equal(cards[1].img, 'fm.jpg')
  assert.equal(cards[1].isPrivateFm, true)
  assert.equal(cards[2].isPrivateRadar, true)
})

test('WY song normalization creates LX online music info', () => {
  const song = {
    id: 123,
    name: 'Song',
    dt: 245000,
    ar: [{ name: 'Singer A' }, { name: 'Singer B' }],
    al: { id: 456, name: 'Album', picUrl: 'https://img.example/a.jpg' },
    h: { size: 1000 },
    l: { size: 500 },
  }
  const privilege = { maxbr: 320000 }
  assert.deepEqual(normalizeNeteaseSong(song, privilege), {
    id: 'wy_123',
    name: 'Song',
    singer: 'Singer A\u3001Singer B',
    source: 'wy',
    interval: '04:05',
    meta: {
      songId: 123,
      albumName: 'Album',
      albumId: 456,
      picUrl: 'https://img.example/a.jpg',
      qualitys: [{ type: '128k', size: '500.00B' }, { type: '320k', size: '1000.00B' }],
      _qualitys: { '128k': { size: '500.00B' }, '320k': { size: '1000.00B' } },
    },
  })
})

test('cookie merge preserves login tokens and applies partial response updates', () => {
  assert.equal(
    mergeNeteaseCookies(
      'MUSIC_U=login-token; __csrf=old-token',
      ['__csrf=new-token; Path=/; HttpOnly', 'NMTID=device-token; Max-Age=31536000'],
    ),
    'MUSIC_U=login-token; __csrf=new-token; NMTID=device-token',
  )
})

test('login QR polling continues only for waiting and scanned states', () => {
  assert.equal(shouldContinueLoginQrPolling(801), true)
  assert.equal(shouldContinueLoginQrPolling(802), true)
  assert.equal(shouldContinueLoginQrPolling(800), false)
  assert.equal(shouldContinueLoginQrPolling(803), false)
  assert.equal(shouldContinueLoginQrPolling(0), false)
})
