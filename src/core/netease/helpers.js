const qrcode = require('qrcode-generator')

const NETEASE_PC_EAPI_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.0.18.203152'
const DAILY_SONG_CATEGORY_TAG_KEY_SEPARATOR = ':'
const DAILY_SONG_CATEGORY_PLAYLIST_ID_PREFIX = 'daily_song_category'
const DAILY_RECOMMEND_CARD_ID = 'wy_daily_recommend'
const PRIVATE_FM_CARD_ID = 'wy_private_fm_card'
const PRIVATE_RADAR_PLAYLIST_ID = '3136952023'

const RECOMMEND_HOME_SECTION_IDS = [
  'radarPlaylists',
  'styleSongs',
  'dailySongCategories',
  'similarSongs',
  'recommendPlaylists',
  'charts',
]

const COOKIE_ATTRIBUTE_NAMES = new Set([
  'domain',
  'expires',
  'httponly',
  'max-age',
  'path',
  'samesite',
  'secure',
])

const collectCookiePairs = (value, target = new Map()) => {
  const values = Array.isArray(value) ? value : [value]
  for (const rawValue of values) {
    if (!rawValue) continue
    for (const part of String(rawValue).split(';')) {
      const index = part.indexOf('=')
      if (index < 1) continue
      const name = part.slice(0, index).trim()
      if (!name || COOKIE_ATTRIBUTE_NAMES.has(name.toLowerCase())) continue
      target.set(name, part.slice(index + 1).trim())
    }
  }
  return target
}

const mergeNeteaseCookies = (oldCookie, nextCookie) => {
  const cookies = collectCookiePairs(oldCookie)
  collectCookiePairs(nextCookie, cookies)
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

const shouldContinueLoginQrPolling = code => code == 801 || code == 802

const getDailySongCategoryTagKey = (categoryId, tagId) => {
  return `${categoryId}${DAILY_SONG_CATEGORY_TAG_KEY_SEPARATOR}${tagId}`
}

const parseDailySongCategoryTagKey = key => {
  const [categoryId, tagId] = String(key).split(DAILY_SONG_CATEGORY_TAG_KEY_SEPARATOR)
  if (!categoryId || !tagId) return null
  return { categoryId, tagId }
}

const getDailySongCategoryPlaylistId = (categoryId, tagId) => {
  return `${DAILY_SONG_CATEGORY_PLAYLIST_ID_PREFIX}__${categoryId}__${tagId}`
}

const parseDailySongCategoryPlaylistId = id => {
  const [prefix, categoryId, tagId] = String(id).split('__')
  if (prefix != DAILY_SONG_CATEGORY_PLAYLIST_ID_PREFIX || !categoryId || !tagId) return null
  return { categoryId, tagId }
}

const getDailySongCategoryTagKeySet = categories => {
  const keys = new Set()
  if (!Array.isArray(categories)) return keys
  for (const category of categories) {
    if (!Array.isArray(category?.tags)) continue
    for (const tag of category.tags) {
      if (!tag?.categoryId || !tag?.tagId) continue
      keys.add(getDailySongCategoryTagKey(tag.categoryId, tag.tagId))
    }
  }
  return keys
}

const getDefaultDailySongCategoryTagKeys = (categories, defaultLimit = 6) => {
  const limit = Math.max(0, Math.floor(Number(defaultLimit) || 0))
  return (Array.isArray(categories?.[0]?.tags) ? categories[0].tags : [])
    .filter(tag => tag?.categoryId && tag?.tagId)
    .slice(0, limit)
    .map(tag => getDailySongCategoryTagKey(tag.categoryId, tag.tagId))
}

const resolveDailySongCategoryTagKeys = (categories, rawKeys, defaultLimit = 6) => {
  const validKeys = getDailySongCategoryTagKeySet(categories)
  if (!validKeys.size) return []

  if (rawKeys == null) {
    return getDefaultDailySongCategoryTagKeys(categories, defaultLimit).filter(key => validKeys.has(key))
  }
  if (!Array.isArray(rawKeys)) return []

  const seen = new Set()
  const keys = []
  for (const key of rawKeys) {
    if (!validKeys.has(key) || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

const normalizeSongIdSeed = value => {
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item == 'object' && item) return item.id ?? item.songId ?? item.itemId
      return item
    }).filter(Boolean).join(',')
  }
  if (typeof value == 'object' && value) return normalizeSongIdSeed(value.id ?? value.songId ?? value.itemId)
  return value == null ? '' : String(value)
}

const getSeedWeight = songId => String(songId).split(',').filter(Boolean).length

const setDailySongSeed = (seedMap, categoryId, tagId, songId) => {
  if (!categoryId || !tagId || !songId) return
  const key = getDailySongCategoryTagKey(String(categoryId), String(tagId))
  const oldSongId = seedMap.get(key)
  if (!oldSongId || getSeedWeight(songId) > getSeedWeight(oldSongId)) seedMap.set(key, songId)
}

const parseUrlQueryParams = value => {
  if (typeof value != 'string' || !value.includes('?')) return {}
  const params = new URLSearchParams(value.slice(value.indexOf('?') + 1))
  return {
    categoryId: params.get('categoryId') ?? '',
    tagId: params.get('tagId') ?? '',
    songId: params.get('songId') ?? '',
  }
}

const collectDailySongSeedCards = (value, seedMap) => {
  if (!value || typeof value != 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectDailySongSeedCards(item, seedMap)
    return
  }

  const extData = value.extData ?? value.resourceExtInfo?.extData ?? {}
  const urlParams = parseUrlQueryParams(value.playBtnData?.playOrpheus ?? value.targetUrl ?? value.resourceUrl)
  const categoryId = value.categoryId ??
    extData?.categoryId ??
    value.resourceExtInfo?.categoryId ??
    value.uiElement?.categoryId ??
    urlParams.categoryId
  const tagId = value.tagId ??
    extData?.tagId ??
    value.resourceExtInfo?.tagId ??
    value.uiElement?.tagId ??
    urlParams.tagId
  const songId = normalizeSongIdSeed(
    value.songId ??
    value.songIds ??
    value.seedSongId ??
    value.seedSongIds ??
    extData?.songId ??
    extData?.songIds ??
    extData?.rcmdData ??
    value.resourceExtInfo?.songId ??
    value.resourceExtInfo?.songIds ??
    urlParams.songId,
  )
  setDailySongSeed(seedMap, categoryId, tagId, songId)

  for (const item of Object.values(value)) collectDailySongSeedCards(item, seedMap)
}

const normalizeRecommendHomeSectionOrder = rawOrder => {
  const seen = new Set()
  const order = []
  if (Array.isArray(rawOrder)) {
    for (const item of rawOrder) {
      if (!RECOMMEND_HOME_SECTION_IDS.includes(item) || seen.has(item)) continue
      seen.add(item)
      order.push(item)
    }
  }
  for (const item of RECOMMEND_HOME_SECTION_IDS) {
    if (seen.has(item)) continue
    order.push(item)
  }
  return order
}

const moveRecommendHomeSection = (rawOrder, section, direction) => {
  const order = normalizeRecommendHomeSectionOrder(rawOrder)
  const index = order.indexOf(section)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= order.length) return order
  const target = order[targetIndex]
  order[targetIndex] = order[index]
  order[index] = target
  return order
}

const createMusicIdentity = musicInfo => `${musicInfo.source}:${musicInfo.id}`

const createRecentPlayList = (list, musicInfo, limit = 520) => {
  const safeList = Array.isArray(list) ? list : []
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 520))
  const targetIdentity = createMusicIdentity(musicInfo)
  return [
    musicInfo,
    ...safeList.filter(item => createMusicIdentity(item) != targetIdentity),
  ].slice(0, safeLimit)
}

const normalizeRecentPlayList = (list, limit = 520) => {
  if (!Array.isArray(list)) return []
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 520))
  const identities = new Set()
  const result = []
  for (const musicInfo of list) {
    if (!musicInfo || typeof musicInfo != 'object' || typeof musicInfo.id != 'string' || !musicInfo.id ||
      typeof musicInfo.source != 'string' || !musicInfo.source || typeof musicInfo.name != 'string' ||
      typeof musicInfo.singer != 'string' || !musicInfo.meta || typeof musicInfo.meta != 'object') continue
    const identity = createMusicIdentity(musicInfo)
    if (identities.has(identity)) continue
    identities.add(identity)
    result.push(musicInfo)
    if (result.length >= safeLimit) break
  }
  return result
}

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const createDefaultListeningTimeStats = () => ({
  schemaVersion: 2,
  countStartedAt: Date.now(),
  totalPlayCount: 0,
  dailyPlayCount: {},
  activeSession: null,
  totalSeconds: 0,
  daily: {},
  songs: {},
  updatedAt: Date.now(),
})

const normalizeListeningTimeStats = stats => {
  const nextStats = createDefaultListeningTimeStats()
  if (!stats || typeof stats != 'object') return nextStats
  nextStats.countStartedAt = Number(stats.countStartedAt) || Date.now()
  nextStats.totalPlayCount = Math.max(0, Math.floor(Number(stats.totalPlayCount) || 0))
  if (stats.dailyPlayCount && typeof stats.dailyPlayCount == 'object') {
    for (const [day, count] of Object.entries(stats.dailyPlayCount)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) nextStats.dailyPlayCount[day] = Math.max(0, Math.floor(Number(count) || 0))
    }
  }
  if (typeof stats.activeSession?.id == 'string' && typeof stats.activeSession?.identity == 'string') nextStats.activeSession = { ...stats.activeSession, accepted: !!stats.activeSession.accepted }
  nextStats.totalSeconds = Math.max(0, Math.floor(Number(stats.totalSeconds) || 0))
  if (stats.daily && typeof stats.daily == 'object' && !Array.isArray(stats.daily)) {
    for (const [date, seconds] of Object.entries(stats.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
      if (safeSeconds) nextStats.daily[date] = safeSeconds
    }
  }
  if (stats.songs && typeof stats.songs == 'object' && !Array.isArray(stats.songs)) {
    for (const song of Object.values(stats.songs)) {
      if (!song || typeof song != 'object' || typeof song.id != 'string' || !song.id) continue
      const seconds = Math.max(0, Math.floor(Number(song.seconds) || 0))
      const playCount = Math.max(0, Math.floor(Number(song.playCount) || 0))
      if (!seconds && !playCount) continue
      const source = typeof song.source == 'string' ? song.source : 'unknown'
      nextStats.songs[`${source}:${song.id}`] = {
        id: song.id,
        source,
        name: typeof song.name == 'string' ? song.name : '',
        singer: typeof song.singer == 'string' ? song.singer : '',
        seconds,
        playCount,
      }
    }
  }
  nextStats.updatedAt = Number(stats.updatedAt) || Date.now()
  return nextStats
}

const addListeningTime = (stats, seconds, song, date = new Date()) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
  if (!safeSeconds) return stats
  const dayKey = getLocalDateKey(date)
  stats.totalSeconds += safeSeconds
  stats.daily[dayKey] = (stats.daily[dayKey] ?? 0) + safeSeconds
  stats.updatedAt = Date.now()
  if (song?.id) {
    const songKey = `${song.source ?? 'unknown'}:${song.id}`
    const songStat = stats.songs[songKey] ?? {
      id: song.id,
      name: song.name,
      singer: song.singer,
      source: song.source,
      seconds: 0,
      playCount: 0,
    }
    songStat.name = song.name
    songStat.singer = song.singer
    songStat.source = song.source
    songStat.seconds += safeSeconds
    stats.songs[songKey] = songStat
  }
  return stats
}

const beginListeningSession = (stats, song, restore = false, id = `${Date.now()}:${Math.random()}`) => {
  const target = song && ('progress' in song ? song.metadata.musicInfo : song)
  const identity = target ? `${target.source}:${target.id}` : ''
  if (restore && stats.activeSession?.identity == identity) return stats.activeSession
  stats.activeSession = identity ? { id, identity, accepted: false } : null
  return stats.activeSession
}

const acceptListeningSession = (stats, song, sessionId, date = new Date()) => {
  const target = song && ('progress' in song ? song.metadata.musicInfo : song)
  const session = stats.activeSession
  if (!target || !session || session.id != sessionId || session.accepted || session.identity != `${target.source}:${target.id}`) return false
  session.accepted = true
  stats.totalPlayCount++
  const day = getLocalDateKey(date)
  stats.dailyPlayCount[day] = (stats.dailyPlayCount[day] ?? 0) + 1
  const entry = stats.songs[session.identity] ?? { id: target.id, source: target.source, name: target.name, singer: target.singer, seconds: 0, playCount: 0 }
  entry.playCount = (entry.playCount ?? 0) + 1
  stats.songs[session.identity] = entry
  stats.updatedAt = date.getTime()
  return true
}

const createNeteaseEapiHeader = rawOptions => {
  const options = rawOptions ?? {}
  const now = Math.floor(Number(options.now ?? Date.now()) || Date.now())
  const random = Math.floor(Number(options.random ?? Math.random() * 1000) || 0)
  const header = {
    osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
    deviceId: String(options.deviceId ?? ''),
    os: 'pc',
    appver: '3.1.17.204416',
    versioncode: '140',
    mobilename: '',
    buildver: String(now).slice(0, 10),
    resolution: '1920x1080',
    __csrf: '',
    channel: 'netease',
    requestId: `${now}_${String(random).padStart(4, '0')}`,
  }
  const cookie = options.cookie
  if (cookie && typeof cookie == 'object') {
    if (cookie.MUSIC_U) header.MUSIC_U = cookie.MUSIC_U
    if (cookie.MUSIC_A) header.MUSIC_A = cookie.MUSIC_A
  }
  return header
}

const createNeteasePcDeviceId = (random = Math.random) => {
  const hexChars = '0123456789ABCDEF'
  let deviceId = ''
  for (let index = 0; index < 52; index += 1) {
    deviceId += hexChars[Math.floor(random() * hexChars.length)]
  }
  return deviceId
}

const createNeteaseEapiCookie = header => {
  return Object.keys(header).map(key => {
    return `${encodeURIComponent(key)}=${encodeURIComponent(header[key] ?? '')}`
  }).join('; ')
}

const createLoginQrKeyPayload = header => {
  return {
    type: 3,
    header,
  }
}

const createLoginQrCheckPayload = (key, header) => {
  return {
    key,
    type: 3,
    header,
  }
}

const createLoginQrUrl = key => {
  return `https://music.163.com/login?codekey=${String(key)}`
}

const createQr = (value, errorCorrectionLevel = 'M') => {
  const qr = qrcode(0, errorCorrectionLevel)
  qr.addData(String(value))
  qr.make()
  return qr
}

const createLoginQrImage = (value, rawOptions) => {
  const options = rawOptions ?? {}
  const cellSize = Math.max(1, Math.floor(Number(options.cellSize) || 6))
  const margin = Math.max(0, Math.floor(Number(options.margin) || 4))
  return createQr(value, options.errorCorrectionLevel).createDataURL(cellSize, margin)
}

const createLoginQrRenderSpec = (value, rawOptions) => {
  if (!value) {
    return {
      modules: [],
      moduleCount: 0,
      margin: 4,
      size: 0,
      cellSize: 0,
      renderSize: 0,
    }
  }

  const options = rawOptions ?? {}
  const margin = Math.max(0, Math.floor(Number(options.margin) || 4))
  const maxSize = Math.max(1, Math.floor(Number(options.maxSize) || 220))
  const qr = createQr(value, options.errorCorrectionLevel)
  const moduleCount = qr.getModuleCount()
  const size = moduleCount + margin * 2
  const cellSize = Math.max(1, Math.floor(maxSize / size))
  const renderSize = size * cellSize
  const modules = Array.from({ length: size }, (_, row) => {
    return Array.from({ length: size }, (_, col) => {
      const qrRow = row - margin
      const qrCol = col - margin
      return qrRow >= 0 && qrRow < moduleCount && qrCol >= 0 && qrCol < moduleCount
        ? qr.isDark(qrRow, qrCol)
        : false
    })
  })

  return {
    modules,
    moduleCount,
    margin,
    size,
    cellSize,
    renderSize,
  }
}

const getHomepagePlaylistImage = resource => {
  const uiElement = resource?.uiElement ?? {}
  const firstImage = Array.isArray(uiElement.images) ? uiElement.images[0] : null
  return uiElement.image?.imageUrl ??
    uiElement.image?.imageWithoutTextUrl ??
    firstImage?.imageUrl ??
    firstImage?.imageWithoutTextUrl ??
    resource?.picUrl ??
    resource?.coverImgUrl ??
    resource?.coverUrl ??
    ''
}

const defaultFormatPlayCount = count => {
  const value = Number(count)
  return Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : ''
}

const normalizeHomepagePlaylistResource = (resource, formatPlayCount = defaultFormatPlayCount) => {
  const id = resource?.resourceId ?? resource?.creativeId ?? resource?.id ?? resource?.playlistId
  if (id == null || Number(id) < 0) return null

  const uiElement = resource?.uiElement ?? {}
  const creator = resource?.resourceExtInfo?.creator ??
    resource?.resourceExtInfo?.users?.[0] ??
    resource?.creator ??
    resource?.user ??
    {}
  const trackCount = resource?.resourceExtInfo?.trackCount ?? resource?.trackCount

  return {
    id: String(id),
    name: uiElement?.mainTitle?.title ?? resource?.name ?? '',
    img: getHomepagePlaylistImage(resource),
    author: creator?.nickname ?? resource?.copywriter ?? '',
    play_count: formatPlayCount(resource?.resourceExtInfo?.playCount ?? resource?.playCount),
    desc: uiElement?.subTitle?.title ?? uiElement?.subTitles?.[0]?.title ?? resource?.copywriter ?? resource?.description ?? null,
    source: 'wy',
    total: trackCount == null ? undefined : String(trackCount),
  }
}

const mergeNeteasePlaylists = playlists => {
  const ids = new Set()
  const list = []
  for (const playlist of Array.isArray(playlists) ? playlists : []) {
    if (!playlist?.id || ids.has(playlist.id)) continue
    ids.add(playlist.id)
    list.push(playlist)
  }
  return list
}

const applyPlaylistSummary = (playlist, summary) => {
  if (!summary) return playlist
  return {
    ...playlist,
    name: playlist.name || summary.name,
    img: playlist.img || summary.img,
    author: playlist.author || summary.author,
    play_count: playlist.play_count || summary.play_count,
    desc: playlist.desc ?? summary.desc,
    total: playlist.total ?? summary.total,
  }
}

const buildRecommendSpecialCards = ({
  dailySongs = [],
  privateFmSongs = [],
  recommendPlaylists = [],
} = {}) => {
  const result = []
  const dailySong = dailySongs[0]
  if (dailySong) {
    result.push({
      id: DAILY_RECOMMEND_CARD_ID,
      source: 'wy',
      play_count: '',
      author: dailySong.singer ?? '',
      name: '每日推荐',
      time: '',
      img: dailySong.meta?.picUrl ?? '',
      desc: `从《${dailySong.name ?? ''}》开始`,
      total: String(dailySongs.length),
      isDailyRecommend: true,
    })
  }

  const privateFmSong = privateFmSongs[0]
  if (privateFmSong) {
    result.push({
      id: PRIVATE_FM_CARD_ID,
      source: 'wy',
      play_count: '',
      author: privateFmSong.singer ?? '',
      name: `从《${privateFmSong.name ?? ''}》开始漫游`,
      time: '',
      img: privateFmSong.meta?.picUrl ?? '',
      desc: privateFmSong.singer || '私人 FM',
      total: '',
      isPrivateFm: true,
    })
  }

  const privateRadar = recommendPlaylists.find(playlist => playlist?.id == PRIVATE_RADAR_PLAYLIST_ID)
  if (privateRadar) result.push({ ...privateRadar, isPrivateRadar: true })

  return result
}

const formatPlayTime = seconds => {
  const time = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(time / 60)
  const s = time % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const sizeFormate = size => {
  const value = Number(size) || 0
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)}GB`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`
  if (value >= 1024) return `${(value / 1024).toFixed(2)}KB`
  return `${value.toFixed(2)}B`
}

const getSinger = singers => singers?.map(s => s.name).filter(Boolean).join('\u3001') ?? ''

const pushQuality = (qualitys, _qualitys, type, size) => {
  const formattedSize = size ? sizeFormate(size) : null
  qualitys.push({ type, size: formattedSize })
  _qualitys[type] = { size: formattedSize }
}

const createQualityInfo = (song, privilege) => {
  const qualitys = []
  const _qualitys = {}
  if (privilege?.maxBrLevel == 'hires' || song.hr) pushQuality(qualitys, _qualitys, 'flac24bit', song.hr?.size)
  switch (privilege?.maxbr ?? 320000) {
    case 999000:
      pushQuality(qualitys, _qualitys, 'flac', song.sq?.size)
    case 320000:
      pushQuality(qualitys, _qualitys, '320k', song.h?.size)
    case 192000:
    case 128000:
      pushQuality(qualitys, _qualitys, '128k', song.l?.size)
      break
    default:
      pushQuality(qualitys, _qualitys, '128k', song.l?.size)
  }
  return { qualitys: qualitys.reverse(), _qualitys }
}

const normalizeNeteaseSong = (song, privilege, extraMeta = {}) => {
  const { qualitys, _qualitys } = createQualityInfo(song, privilege)
  return {
    id: `wy_${song.id}`,
    name: song.name ?? '',
    singer: getSinger(song.ar ?? song.artists),
    source: 'wy',
    interval: typeof song.dt == 'number' ? formatPlayTime(song.dt / 1000) : null,
    meta: {
      songId: song.id,
      albumName: song.al?.name ?? song.album?.name ?? '',
      albumId: song.al?.id ?? song.album?.id,
      picUrl: song.al?.picUrl ?? song.album?.picUrl ?? song.album?.blurPicUrl ?? song.picUrl ?? '',
      qualitys,
      _qualitys,
      ...extraMeta,
    },
  }
}

module.exports = {
  NETEASE_PC_EAPI_USER_AGENT,
  DAILY_SONG_CATEGORY_TAG_KEY_SEPARATOR,
  DAILY_SONG_CATEGORY_PLAYLIST_ID_PREFIX,
  DAILY_RECOMMEND_CARD_ID,
  PRIVATE_FM_CARD_ID,
  PRIVATE_RADAR_PLAYLIST_ID,
  RECOMMEND_HOME_SECTION_IDS,
  mergeNeteaseCookies,
  shouldContinueLoginQrPolling,
  getDailySongCategoryTagKey,
  parseDailySongCategoryTagKey,
  getDailySongCategoryPlaylistId,
  parseDailySongCategoryPlaylistId,
  collectDailySongSeedCards,
  resolveDailySongCategoryTagKeys,
  normalizeRecommendHomeSectionOrder,
  moveRecommendHomeSection,
  createMusicIdentity,
  createRecentPlayList,
  normalizeRecentPlayList,
  getLocalDateKey,
  beginListeningSession,
  acceptListeningSession,
  createDefaultListeningTimeStats,
  normalizeListeningTimeStats,
  addListeningTime,
  createNeteasePcDeviceId,
  createNeteaseEapiHeader,
  createNeteaseEapiCookie,
  createLoginQrKeyPayload,
  createLoginQrCheckPayload,
  createLoginQrUrl,
  createLoginQrImage,
  createLoginQrRenderSpec,
  normalizeHomepagePlaylistResource,
  mergeNeteasePlaylists,
  applyPlaylistSummary,
  buildRecommendSpecialCards,
  formatPlayTime,
  sizeFormate,
  normalizeNeteaseSong,
}
