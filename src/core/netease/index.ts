import { httpFetch } from '@/utils/request'
import { eapi, weapi } from '@/utils/musicSdk/wy/utils/crypto'
import { getNeteaseAccountData, saveNeteaseAccountData } from '@/utils/data'
import { formatPlayCount } from '@/utils'
import settingState from '@/store/setting/state'
import { getDeviceProfile } from '@/core/platform/credentials'
import { sha256Hex } from '@/core/platform/crypto'
import {
  NETEASE_PC_EAPI_USER_AGENT,
  createLoginQrCheckPayload,
  createLoginQrImage,
  createLoginQrKeyPayload,
  createLoginQrUrl,
  createNeteaseEapiCookie,
  createNeteaseEapiHeader,
  DAILY_RECOMMEND_CARD_ID,
  collectDailySongSeedCards,
  getDailySongCategoryPlaylistId,
  getDailySongCategoryTagKey,
  normalizeHomepagePlaylistResource,
  normalizeNeteaseSong,
  mergeNeteasePlaylists,
  mergeNeteaseCookies,
  applyPlaylistSummary,
  parseDailySongCategoryTagKey,
  PRIVATE_RADAR_PLAYLIST_ID,
  resolveDailySongCategoryTagKeys,
} from './helpers'

type AnyObject = Record<string, any>
type ResponseWithCookie<T> = T & { cookie?: string }

const successCode = 200
let accountGeneration = 0
let accountWriteTail: Promise<unknown> = Promise.resolve()
const loginQrGenerations = new Map<string, number>()
export const getNeteaseAccountGeneration = () => accountGeneration
export const cancelLoginQr = () => { accountGeneration++; loginQrGenerations.clear() }
const playlistDetailLimit = 1000
const playlistDetailPageLimit = 30
const HOMEPAGE_BATCH_API = '/api/homepage/block/page'
const PC_CUSTOMIZE_BATCH_API = '/api/pc/customize/block/page'
const HOME_BLOCK_CODES = {
  radarPlaylists: 'PC_CUSTOMIZE_PLAYLIST_SLIDE_PAPE',
  styleSongs: 'HOMEPAGE_BLOCK_STYLE_RCMD',
  similarSongs: 'HOMEPAGE_BLOCK_RED_SIMILAR_SONG',
  legacyRadarPlaylists: 'HOMEPAGE_BLOCK_MGC_PLAYLIST',
  legacyRecommendPlaylists: 'HOMEPAGE_BLOCK_PLAYLIST_RCMD',
}
const fallbackRadarPlaylistIds = ['2829883282', '5320167908', '5362359247', '5327906368', '5300458264']
const specialPlaylistIds = new Set([PRIVATE_RADAR_PLAYLIST_ID, ...fallbackRadarPlaylistIds])
const publicPrivateRadarPlaylistIds = new Set([PRIVATE_RADAR_PLAYLIST_ID])

const asOptionalObject = (value: unknown): AnyObject | null => {
  return typeof value == 'object' && value != null && !Array.isArray(value)
    ? value as AnyObject
    : null
}

const asObject = (value: unknown): AnyObject => {
  return asOptionalObject(value) ?? {}
}

const asObjectArray = (value: unknown): AnyObject[] => {
  return Array.isArray(value)
    ? value.filter((item): item is AnyObject => typeof item == 'object' && item != null)
    : []
}

const normalizeCookie = (cookie: unknown): string => {
  if (!cookie) return ''
  if (Array.isArray(cookie)) return cookie.filter(Boolean).join(';')
  return String(cookie)
}

const cookieToObject = (cookie: string): AnyObject => {
  const data: AnyObject = {}
  for (const item of cookie.split(';')) {
    const index = item.indexOf('=')
    if (index < 0) continue
    const key = decodeURIComponent(item.slice(0, index).trim())
    if (!key) continue
    data[key] = decodeURIComponent(item.slice(index + 1).trim())
  }
  return data
}

const getResponseCookie = (body: unknown, headers: AnyObject | undefined) => {
  const headerCookie = normalizeCookie(headers?.['set-cookie'] ?? headers?.['Set-Cookie'])
  const bodyCookie = normalizeCookie(asOptionalObject(body)?.cookie)
  return headerCookie || bodyCookie
}

const getResponseMessage = (body: AnyObject, fallback: string) => {
  return String(body.message ?? body.msg ?? body.data?.message ?? body.data?.msg ?? fallback)
}

const normalizeProfile = (profile: any): LX.Netease.Profile | null => {
  if (!profile?.userId) return null
  return {
    userId: Number(profile.userId),
    nickname: profile.nickname ?? '',
    avatarUrl: profile.avatarUrl ?? '',
    backgroundUrl: profile.backgroundUrl,
    signature: profile.signature,
  }
}

const createEmptyAccount = (): LX.Netease.NeteaseAccountData => ({
  cookie: '',
  status: {
    isLoggedIn: false,
    profile: null,
  },
  updatedAt: 0,
})

export const getAccountData = async() => {
  await accountWriteTail
  return await getNeteaseAccountData() ?? createEmptyAccount()
}

export const saveAccountData = async(data: LX.Netease.NeteaseAccountData | null, expected = accountGeneration) => {
  const task = accountWriteTail.then(async() => {
    if (expected != accountGeneration) throw new Error('账号请求已取消')
    const previous = await getNeteaseAccountData()
    if (expected != accountGeneration) throw new Error('账号请求已取消')
    await saveNeteaseAccountData(data)
    if (expected != accountGeneration) {
      await saveNeteaseAccountData(previous)
      throw new Error('账号请求已取消')
    }
  })
  accountWriteTail = task.catch(() => {})
  await task
}

const requestWeapi = async<T = AnyObject>(url: string, data: AnyObject = {}, cookie = ''): Promise<ResponseWithCookie<T>> => {
  const request = httpFetch(`https://music.163.com${url}`, {
    method: 'post',
    headers: {
      Cookie: cookie,
      Referer: 'https://music.163.com/',
      origin: 'https://music.163.com',
      'User-Agent': NETEASE_PC_EAPI_USER_AGENT,
    },
    form: weapi({
      csrf_token: '',
      ...data,
    }),
  })
  const { body, headers } = await request.promise
  return {
    ...(body as T),
    cookie: getResponseCookie(body, headers as AnyObject | undefined),
  }
}

const requestApi = async<T = AnyObject>(url: string, data: AnyObject = {}, cookie = ''): Promise<ResponseWithCookie<T>> => {
  const request = httpFetch(`https://music.163.com${url}`, {
    method: 'post',
    headers: {
      Cookie: cookie,
      Referer: 'https://music.163.com/',
      origin: 'https://music.163.com',
      'User-Agent': NETEASE_PC_EAPI_USER_AGENT,
    },
    form: data,
  })
  const { body, headers } = await request.promise
  return {
    ...(body as T),
    cookie: getResponseCookie(body, headers as AnyObject | undefined),
  }
}

const requestEapi = async<T = AnyObject>(url: string, createData: (header: AnyObject) => AnyObject, cookie = ''): Promise<ResponseWithCookie<T>> => {
  const apiPath = url.startsWith('/api/') ? url : `/api/${url.replace(/^\/+/, '')}`
  const device = await getDeviceProfile()
  const header = createNeteaseEapiHeader({
    deviceId: sha256Hex(`${device.KUGOU_API_GUID}:netease`).slice(0, 52).toUpperCase(),
    cookie: cookieToObject(cookie),
  })
  const data = createData(header)
  const request = httpFetch(`https://interface.music.163.com/eapi/${apiPath.slice(5)}`, {
    method: 'post',
    headers: {
      Cookie: createNeteaseEapiCookie(header),
      'User-Agent': NETEASE_PC_EAPI_USER_AGENT,
    },
    form: eapi(apiPath, data),
  })
  const { body, headers } = await request.promise
  return {
    ...(body as T),
    cookie: getResponseCookie(body, headers as AnyObject | undefined),
  }
}

const assertOk = (body: AnyObject, message: string) => {
  if (body?.code != null && Number(body.code) != successCode) throw new Error(getResponseMessage(body, message))
}

export const refreshLoginStatus = async(cookie: string, expected = accountGeneration): Promise<LX.Netease.AccountStatus> => {
  if (!cookie) return { isLoggedIn: false, profile: null }

  const body = await requestWeapi<AnyObject>('/weapi/w/nuser/account/get', {}, cookie)
  const profile = normalizeProfile(body.profile ?? body.data?.profile)
  const nextCookie = mergeNeteaseCookies(cookie, body.cookie)
  const status = {
    isLoggedIn: !!profile,
    profile,
  }
  await saveAccountData({
    cookie: nextCookie,
    status,
    updatedAt: Date.now(),
  }, expected)
  return status
}

export const getAccountStatus = async(): Promise<LX.Netease.AccountStatus> => {
  const expected = accountGeneration
  const account = await getAccountData()
  if (expected != accountGeneration) throw new Error('账号已改变')
  if (!account.cookie) return { isLoggedIn: false, profile: null }

  if (account.status.isLoggedIn && account.status.profile && Date.now() - account.updatedAt < 5 * 60 * 1000) {
    return account.status
  }

  return refreshLoginStatus(account.cookie, expected).catch(error => {
    if (expected != accountGeneration) throw error
    return account.status
  })
}

export const createLoginQr = async(): Promise<LX.Netease.LoginQr> => {
  cancelLoginQr()
  const expected = accountGeneration
  const keyBody = await requestEapi<AnyObject>('/api/login/qrcode/unikey', createLoginQrKeyPayload)
  if (expected != accountGeneration) throw new Error('登录已取消')
  const key = keyBody.data?.unikey ?? keyBody.unikey
  if (!key) throw new Error(getResponseMessage(keyBody, 'Failed to create login QR key'))
  loginQrGenerations.set(String(key), expected)
  const qrurl = createLoginQrUrl(key)

  return {
    key,
    qrurl,
    qrimg: createLoginQrImage(qrurl),
  }
}

export const checkLoginQr = async(key: string): Promise<LX.Netease.LoginQrCheck> => {
  const expected = loginQrGenerations.get(key)
  if (expected == null || expected != accountGeneration) throw new Error('登录已取消')
  const body = await requestEapi<AnyObject>('/api/login/qrcode/client/login', header => createLoginQrCheckPayload(key, header))
  if (expected != accountGeneration) throw new Error('登录已取消')
  const code = Number(body.code ?? 0)
  const message = body.message ?? ''
  if (code != 803) {
    return {
      code,
      message,
      isLoggedIn: false,
      profile: null,
    }
  }

  const cookie = normalizeCookie(body.cookie)
  const status = await refreshLoginStatus(cookie, expected)
  return {
    code,
    message,
    cookie,
    ...status,
  }
}

export const logout = async() => {
  cancelLoginQr()
  const previous = getNeteaseAccountData()
  // Queue clearing synchronously. A login started after logout must commit after this erase.
  const clear = accountWriteTail.then(async() => { await saveNeteaseAccountData(createEmptyAccount()) })
  accountWriteTail = clear.catch(() => {})
  await clear
  const account = await previous
  if (account?.cookie) {
    await requestWeapi('/weapi/logout', {}, account.cookie).catch(() => null)
  }
}

export const getUserPlaylists = async(kinds: readonly LX.PlatformPlaylistKind[] = ['created', 'collected']): Promise<LX.PlatformPlaylistSummary[]> => {
  const expected = accountGeneration
  const account = await getAccountData()
  const accountKey = String(account.status.profile?.userId ?? '')
  if (!account.cookie || !accountKey) throw new Error('请先登录网易云音乐')
  const result = new Map<string, LX.PlatformPlaylistSummary>()
  const seen = new Set<string>()
  for (let offset = 0; offset < 100000; offset += 100) {
    const body = await requestWeapi('/weapi/user/playlist', { uid: accountKey, limit: 100, offset, includeVideo: true }, account.cookie)
    if (expected != accountGeneration) throw new Error('账号已改变')
    assertOk(body, '网易云歌单读取失败')
    if (!Array.isArray(body.playlist)) throw new Error('网易云歌单响应无效')
    const before = seen.size
    for (const row of body.playlist) {
      const id = String(row.id ?? '')
      if (!id) throw new Error('网易云歌单缺少标识')
      seen.add(id)
      const kind = String(row.creator?.userId) == accountKey ? 'created' : 'collected'
      if (kinds.includes(kind)) result.set(`${kind}:${id}`, { provider: 'netease', accountKey, kind, id, sourceListId: id, name: String(row.name ?? ''), coverUrl: String(row.coverImgUrl ?? '') })
    }
    if (!body.more) return [...result.values()]
    if (before == seen.size) throw new Error('网易云歌单分页未完整返回，已保留上次内容')
  }
  throw new Error('网易云歌单分页超过上限')
}

const getCookie = async(required = false) => {
  const account = await getAccountData()
  if (required && !account.cookie) throw new Error('Not logged in')
  return account.cookie
}

const getSongId = (musicInfo: LX.Music.MusicInfo | AnyObject) => {
  const info = musicInfo as AnyObject
  const rawId = info?.meta?.songId ?? info?.songId ?? info?.id
  return String(rawId).replace(/^wy_/, '')
}

const normalizeSongs = (songs: AnyObject[] = [], privileges: AnyObject[] = [], extraMeta?: (song: AnyObject, index: number) => AnyObject) => {
  return songs.map((song, index) => normalizeNeteaseSong(song, privileges[index], extraMeta?.(song, index)) as LX.Music.MusicInfoOnline)
}

const normalizePlaylist = (playlist: AnyObject): LX.Netease.Playlist | null => {
  return normalizeHomepagePlaylistResource(playlist, formatPlayCount) as LX.Netease.Playlist | null
}

const normalizePlaylistList = (playlists: AnyObject[] = []): LX.Netease.Playlist[] => {
  return mergeNeteasePlaylists(playlists
    .map(normalizePlaylist)
    .filter((playlist): playlist is LX.Netease.Playlist => !!playlist)) as LX.Netease.Playlist[]
}

const getHomeBlock = (blocks: AnyObject[], blockCode: string) => {
  return blocks.find(block => block?.blockCode == blockCode) ?? null
}

const getHomeBlockTitle = (blocks: AnyObject[], blockCode: string) => {
  return getHomeBlock(blocks, blockCode)?.uiElement?.subTitle?.title ?? ''
}

const getHomeBlockResources = (blocks: AnyObject[], blockCode: string): AnyObject[] => {
  const block = getHomeBlock(blocks, blockCode)
  return asObjectArray(block?.creatives).flatMap(creative => {
    const resources = asObjectArray(creative.resources)
    return resources.length ? resources : [creative]
  })
}

const parseHomepagePlaylistBlock = (blocks: AnyObject[], blockCode: string, limit: number): LX.Netease.Playlist[] => {
  return (mergeNeteasePlaylists(
    getHomeBlockResources(blocks, blockCode)
      .map(resource => normalizeHomepagePlaylistResource(resource, formatPlayCount) as LX.Netease.Playlist | null)
      .filter((playlist): playlist is LX.Netease.Playlist => !!playlist && !!playlist.name && !!playlist.img),
  ) as LX.Netease.Playlist[]).slice(0, limit)
}

const parseBatchBlocks = (result: AnyObject, apiPath: string, errorMessage: string): AnyObject[] => {
  const body = asObject(result?.[apiPath] ?? result)
  assertOk(body, errorMessage)
  return asObjectArray(body.data?.blocks)
}

const requestBatch = async(query: AnyObject, cookie: string) => {
  const data: AnyObject = {}
  for (const key of Object.keys(query)) {
    if (/^\/api\//.test(key)) data[key] = query[key]
  }
  return requestEapi<AnyObject>('/api/batch', header => ({
    ...data,
    header,
  }), cookie)
}

const getHomepageBlocks = async(cookie: string, forceRefresh = false, blockCodes?: string[]) => {
  const cursor = blockCodes?.length
    ? JSON.stringify({ offset: 0, blockCodeOrderList: blockCodes })
    : undefined
  const body = await requestWeapi<AnyObject>('/weapi/homepage/block/page', {
    refresh: forceRefresh,
    cursor,
    extInfo: JSON.stringify({ abInfo: { 'hp-new-homepageV3.1': 't3' } }),
    newStyle: 'true',
  }, cookie)
  assertOk(body, 'Failed to load homepage blocks')
  return asObjectArray(body.data?.blocks)
}

const getHomepageBatchBlocks = async(cookie: string, forceRefresh = false, blockCodes: string[] = []) => {
  const result = await requestBatch({
    [HOMEPAGE_BATCH_API]: JSON.stringify({
      refresh: forceRefresh,
      cursor: JSON.stringify({ offset: 0, blockCodeOrderList: blockCodes }),
      extInfo: JSON.stringify({ abInfo: { 'hp-new-homepageV3.1': 't3' } }),
      newStyle: true,
    }),
  }, cookie)
  return parseBatchBlocks(result, HOMEPAGE_BATCH_API, 'Failed to load homepage batch blocks')
}

const getPcCustomizeBatchBlocks = async(cookie: string, forceRefresh = false, showType?: string) => {
  const result = await requestBatch({
    [PC_CUSTOMIZE_BATCH_API]: JSON.stringify(showType
      ? { showType, refresh: forceRefresh, offset: 0, limit: 20 }
      : { newStyle: true, refresh: forceRefresh }),
  }, cookie)
  return parseBatchBlocks(result, PC_CUSTOMIZE_BATCH_API, 'Failed to load pc customize batch blocks')
}

const getHomeBatchBlocks = async(
  cookie: string,
  forceRefresh = false,
  blockCodes: string[] = [],
  includePcCustomize = false,
) => {
  const query: AnyObject = {}
  if (blockCodes.length) {
    query[HOMEPAGE_BATCH_API] = JSON.stringify({
      refresh: forceRefresh,
      cursor: JSON.stringify({ offset: 0, blockCodeOrderList: blockCodes }),
      extInfo: JSON.stringify({ abInfo: { 'hp-new-homepageV3.1': 't3' } }),
      newStyle: true,
    })
  }
  if (includePcCustomize) {
    query[PC_CUSTOMIZE_BATCH_API] = JSON.stringify({
      newStyle: true,
      refresh: forceRefresh,
    })
  }
  const result = await requestBatch(query, cookie)
  return {
    homepageBlocks: blockCodes.length
      ? (() => {
          try {
            return parseBatchBlocks(result, HOMEPAGE_BATCH_API, 'Failed to load homepage batch blocks')
          } catch {
            return []
          }
        })()
      : [],
    pcCustomizeBlocks: includePcCustomize
      ? (() => {
          try {
            return parseBatchBlocks(result, PC_CUSTOMIZE_BATCH_API, 'Failed to load pc customize batch blocks')
          } catch {
            return []
          }
        })()
      : [],
  }
}

export const getRecommendSongs = async(): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = await getCookie(true)
  const body = await requestWeapi<AnyObject>('/weapi/v3/discovery/recommend/songs', { total: true }, cookie)
  assertOk(body, 'Failed to load daily recommendations')
  const songs = asObjectArray(body.data?.dailySongs ?? body.recommend)
  const privileges = asObjectArray(body.data?.privileges ?? body.privileges)
  return normalizeSongs(songs, privileges, song => ({
    recommendTag: song.reason ?? song.recommendReason ?? null,
  }))
}

export const getPrivateFm = async(params: LX.Netease.PrivateFmParams = {}): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = await getCookie(true)
  const mode = params.mode ?? 'DEFAULT'
  const body = mode == 'DEFAULT'
    ? await requestWeapi<AnyObject>('/weapi/v1/radio/get', {}, cookie)
    : await requestWeapi<AnyObject>('/weapi/v1/radio/get', { mode, limit: params.limit ?? 3 }, cookie)
  assertOk(body, 'Failed to load private FM')
  return normalizeSongs(asObjectArray(body.data ?? body.songs), asObjectArray(body.privileges))
}

export const getPrivateFmSongs = getPrivateFm

export const getDailySongCategories = async(): Promise<LX.Netease.DailySongCategory[]> => {
  const cookie = await getCookie(true)
  const body = await requestWeapi<AnyObject>('/weapi/homepage/daily/song/config/get', { limit: 20 }, cookie)
  assertOk(body, 'Failed to load daily song categories')
  const categories = asObjectArray(body.data?.categorys ?? body.data?.categories ?? body.categorys)
  return categories.map(category => {
    const categoryId = String(category.categoryId ?? category.id ?? '')
    const categoryName = category.categoryName ?? category.name ?? ''
    const tags = asObjectArray(category.tagVOList ?? category.tags).map(tag => ({
      categoryId,
      categoryName,
      tagId: String(tag.tagId ?? tag.id ?? ''),
      tagName: tag.tagName ?? tag.name ?? '',
    })).filter((tag: LX.Netease.DailySongTag) => tag.categoryId && tag.tagId)
    return { categoryId, categoryName, tags }
  }).filter((category: LX.Netease.DailySongCategory) => category.categoryId && category.tags.length)
}

const getDailySongClientTime = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ' ' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(':')
}

const getDailySongCategorySeedMap = async(cookie: string): Promise<Map<string, string>> => {
  const seedMap = new Map<string, string>()
  const body = await requestApi<AnyObject>('/api/pc/daily/rcmd/block', {
    clientTime: getDailySongClientTime(),
  }, cookie)
  collectDailySongSeedCards(body.data ?? body, seedMap)
  return seedMap
}

const saveDailySongCategoryTag = async(tag: Pick<LX.Netease.DailySongTag, 'categoryId' | 'tagId'>, cookie: string) => {
  await requestWeapi<AnyObject>('/weapi/homepage/daily/song/tag/save', {
    tags: JSON.stringify({
      categoryId: Number.isFinite(Number(tag.categoryId)) ? Number(tag.categoryId) : tag.categoryId,
      tagIds: [Number.isFinite(Number(tag.tagId)) ? Number(tag.tagId) : tag.tagId],
    }),
  }, cookie)
}

const normalizeDailySongCategorySongBody = (body: AnyObject, message = 'Failed to load daily song category') => {
  assertOk(body, message)
  if (body.data?.demote) throw new Error('Daily song category returned demoted songs')
  const songs = asObjectArray(body.data?.dailySongs ?? body.data?.songs ?? body.songs)
  const privileges = asObjectArray(body.data?.privileges ?? body.privileges)
  return normalizeSongs(songs, privileges, () => ({
    recommendTag: body.data?.title ?? null,
  }))
}

const getSavedDailySongCategorySongs = async(
  tag: Pick<LX.Netease.DailySongTag, 'categoryId' | 'tagId'>,
  cookie: string,
): Promise<LX.Music.MusicInfoOnline[]> => {
  await saveDailySongCategoryTag(tag, cookie)
  const body = await requestWeapi<AnyObject>('/weapi/homepage/category/daily/song/list', {}, cookie)
  return normalizeDailySongCategorySongBody(body)
}

const getDailySongCategorySongsByTag = async(
  tag: LX.Netease.DailySongTag | Pick<LX.Netease.DailySongTag, 'categoryId' | 'tagId'>,
  cookie: string,
  seedMap?: Map<string, string>,
): Promise<LX.Music.MusicInfoOnline[]> => {
  const songId = seedMap?.get(getDailySongCategoryTagKey(tag.categoryId, tag.tagId)) ?? ''
  if (!songId) return getSavedDailySongCategorySongs(tag, cookie)

  const body = await requestWeapi<AnyObject>('/weapi/homepage/category/daily/song/list', {
    source: 'homepage',
    categoryId: tag.categoryId,
    tagId: tag.tagId,
    songId,
  }, cookie)
  if (body.data?.demote) return getSavedDailySongCategorySongs(tag, cookie)
  return normalizeDailySongCategorySongBody(body)
}

export const getDailySongCategorySongs = async(categoryId: string, tagId: string): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = await getCookie(true)
  const tag = { categoryId, tagId }
  const seedMap = await getDailySongCategorySeedMap(cookie).catch(() => new Map<string, string>())
  return getDailySongCategorySongsByTag(tag, cookie, seedMap)
}

export const getDailySongCategoryPlaylists = async(): Promise<LX.Netease.Playlist[]> => {
  const cookie = await getCookie(true)
  const categories = await getDailySongCategories()
  const keys: string[] = resolveDailySongCategoryTagKeys(categories, settingState.setting['recommend.dailySongCategoryTagKeys'])
  const tagMap = new Map<string, LX.Netease.DailySongTag>()

  for (const category of categories) {
    for (const tag of category.tags) {
      tagMap.set(getDailySongCategoryTagKey(tag.categoryId, tag.tagId), tag)
    }
  }

  const seedMap = await getDailySongCategorySeedMap(cookie).catch(() => new Map<string, string>())
  const list: LX.Netease.Playlist[] = []
  for (const key of keys) {
    const parsed = parseDailySongCategoryTagKey(key)
    if (!parsed) continue
    const tag = tagMap.get(key)
    if (!tag) continue
    const songs = await getDailySongCategorySongsByTag(tag, cookie, seedMap).catch(() => [])
    if (!songs.length) continue
    list.push({
      id: getDailySongCategoryPlaylistId(parsed.categoryId, parsed.tagId),
      name: `${tag.tagName}日推`,
      img: songs[0]?.meta.picUrl ?? '',
      author: tag.categoryName,
      play_count: '每日更新',
      desc: tag.categoryName,
      source: 'wy',
      total: songs.length ? String(songs.length) : undefined,
    })
  }

  return list
}

const getPlaylistSummary = async(id: string, cookie: string): Promise<LX.Netease.Playlist | null> => {
  const body = await requestWeapi<AnyObject>('/weapi/v3/playlist/detail', {
    id,
    n: 1,
    s: 0,
  }, cookie).catch(() => null)
  const playlist = asOptionalObject(body?.playlist)
  return normalizePlaylistList(playlist ? [playlist] : [])[0] ?? null
}

const hydratePlaylistCovers = async(playlists: LX.Netease.Playlist[], cookie: string): Promise<LX.Netease.Playlist[]> => {
  const details = await Promise.all(playlists.map(async playlist => {
    if (playlist.name && playlist.img) return null
    return getPlaylistSummary(playlist.id, cookie)
  }))
  return playlists.map((playlist, index) => applyPlaylistSummary(playlist, details[index]))
}

const parsePcCustomizePlaylistBlock = async(
  blocks: AnyObject[],
  blockCode: string,
  limit: number,
  cookie: string,
): Promise<LX.Netease.Playlist[]> => {
  const playlists = (mergeNeteasePlaylists(
    getHomeBlockResources(blocks, blockCode)
      .map(resource => normalizeHomepagePlaylistResource(resource, formatPlayCount) as LX.Netease.Playlist | null)
      .filter((playlist): playlist is LX.Netease.Playlist => !!playlist && !!playlist.name),
  ) as LX.Netease.Playlist[]).slice(0, limit)
  return hydratePlaylistCovers(playlists, cookie)
}

const getFallbackRadarPlaylists = async(cookie: string): Promise<LX.Netease.Playlist[]> => {
  const playlists = await Promise.all(fallbackRadarPlaylistIds.map(async id => getPlaylistSummary(id, cookie)))
  return playlists.filter((playlist): playlist is LX.Netease.Playlist => !!playlist)
}

const getHomeRadarPlaylists = async(
  blocks: AnyObject[],
  cookie: string,
  limit: number,
  forceRefresh = false,
): Promise<LX.Netease.Playlist[]> => {
  let radarPlaylists = await parsePcCustomizePlaylistBlock(blocks, HOME_BLOCK_CODES.radarPlaylists, limit, cookie)
  if (!radarPlaylists.length) {
    const pcCustomizeBlocks = await getPcCustomizeBatchBlocks(cookie, forceRefresh, HOME_BLOCK_CODES.radarPlaylists).catch(() => [])
    radarPlaylists = await parsePcCustomizePlaylistBlock(pcCustomizeBlocks, HOME_BLOCK_CODES.radarPlaylists, limit, cookie)
  }
  if (!radarPlaylists.length) {
    const radarBlocks = await getHomepageBlocks(cookie, forceRefresh, [HOME_BLOCK_CODES.legacyRadarPlaylists]).catch(() => [])
    radarPlaylists = parseHomepagePlaylistBlock(radarBlocks, HOME_BLOCK_CODES.legacyRadarPlaylists, limit)
  }
  if (!radarPlaylists.length) return getFallbackRadarPlaylists(cookie)
  return radarPlaylists
}

const addHomeSong = (
  songs: LX.Music.MusicInfoOnline[],
  ids: Set<string>,
  song: AnyObject,
  privilege?: AnyObject,
  recommendTag?: string | null,
) => {
  if (!song?.id || !song?.name || ids.has(String(song.id))) return false
  ids.add(String(song.id))
  songs.push(normalizeNeteaseSong(song, privilege, {
    recommendTag: recommendTag ?? null,
  }) as LX.Music.MusicInfoOnline)
  return true
}

const isHomepageSongData = (value: AnyObject) => {
  return !!(
    value?.id != null &&
    value.name &&
    !value.resourceId &&
    !value.resourceType &&
    (Array.isArray(value.ar) || Array.isArray(value.artists)) &&
    (value.al || value.album)
  )
}

const getHomeSongRecommendTag = (value: AnyObject): string | null => {
  const subTitle = value?.uiElement?.subTitle ?? value?.subTitle ?? value?.resourceExtInfo?.uiElement?.subTitle
  if (!subTitle?.title) return null
  return subTitle.titleType == 'songRcmdTag' ? subTitle.title : null
}

const collectHomeSongs = (
  value: unknown,
  songs: LX.Music.MusicInfoOnline[],
  ids: Set<string>,
) => {
  if (!value || typeof value != 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectHomeSongs(item, songs, ids)
    return
  }

  const data = value as AnyObject
  const recommendTag = getHomeSongRecommendTag(data)
  const embeddedSongs = data.songDatas ?? data.songs ?? data.resourceExtInfo?.songDatas ?? data.resourceExtInfo?.songs
  if (Array.isArray(embeddedSongs) && embeddedSongs.length) {
    const privileges = asObjectArray(data.privileges ?? data.songPrivileges ?? data.resourceExtInfo?.songPrivileges ?? data.resourceExtInfo?.privileges)
    const addedCount = asObjectArray(embeddedSongs).reduce((count: number, song: AnyObject, index: number) => {
      return addHomeSong(songs, ids, song, privileges[index], recommendTag) ? count + 1 : count
    }, 0)
    if (addedCount) return
  }

  const embeddedSong = asOptionalObject(data.songData ?? data.song ?? data.resourceExtInfo?.songData ?? data.resourceExtInfo?.song)
  if (embeddedSong) {
    addHomeSong(
      songs,
      ids,
      embeddedSong,
      asOptionalObject(data.privilege ?? data.resourceExtInfo?.songPrivilege ?? data.resourceExtInfo?.privilege) ?? undefined,
      recommendTag,
    )
    return
  }

  if (isHomepageSongData(data)) {
    addHomeSong(songs, ids, data, asOptionalObject(data.privilege) ?? undefined, recommendTag)
    return
  }

  for (const child of Object.values(data)) collectHomeSongs(child, songs, ids)
}

const parseHomepageSongBlock = (blocks: AnyObject[], blockCode: string, limit: number): LX.Music.MusicInfoOnline[] => {
  const songs: LX.Music.MusicInfoOnline[] = []
  const ids = new Set<string>()
  for (const resource of getHomeBlockResources(blocks, blockCode)) {
    collectHomeSongs(resource, songs, ids)
    if (songs.length >= limit) break
  }
  return songs.slice(0, limit)
}

const getHomeStyleSongs = async(
  blocks: AnyObject[],
  cookie: string,
  limit: number,
  forceRefresh = false,
): Promise<{ title: string, songs: LX.Music.MusicInfoOnline[] }> => {
  let title = getHomeBlockTitle(blocks, HOME_BLOCK_CODES.styleSongs)
  let songs = parseHomepageSongBlock(blocks, HOME_BLOCK_CODES.styleSongs, limit)
  if (!songs.length) {
    const styleSongBlocks = await getHomepageBatchBlocks(cookie, forceRefresh, [HOME_BLOCK_CODES.styleSongs]).catch(() => [])
    title ||= getHomeBlockTitle(styleSongBlocks, HOME_BLOCK_CODES.styleSongs)
    songs = parseHomepageSongBlock(styleSongBlocks, HOME_BLOCK_CODES.styleSongs, limit)
  }
  if (!songs.length) {
    const styleSongBlocks = await getHomepageBlocks(cookie, forceRefresh, [HOME_BLOCK_CODES.styleSongs]).catch(() => [])
    title ||= getHomeBlockTitle(styleSongBlocks, HOME_BLOCK_CODES.styleSongs)
    songs = parseHomepageSongBlock(styleSongBlocks, HOME_BLOCK_CODES.styleSongs, limit)
  }
  return {
    title: title || '',
    songs,
  }
}

const getHomeSimilarSongs = async(blocks: AnyObject[], cookie: string, limit: number, forceRefresh = false): Promise<LX.Music.MusicInfoOnline[]> => {
  let songs = parseHomepageSongBlock(blocks, HOME_BLOCK_CODES.similarSongs, limit)
  if (!songs.length) {
    const similarBlocks = await getHomepageBatchBlocks(cookie, forceRefresh, [HOME_BLOCK_CODES.similarSongs]).catch(() => [])
    songs = parseHomepageSongBlock(similarBlocks, HOME_BLOCK_CODES.similarSongs, limit)
  }
  if (!songs.length) {
    const similarBlocks = await getHomepageBlocks(cookie, forceRefresh, [HOME_BLOCK_CODES.similarSongs]).catch(() => [])
    songs = parseHomepageSongBlock(similarBlocks, HOME_BLOCK_CODES.similarSongs, limit)
  }
  if (songs.length) return songs
  if (cookie) {
    const dailySongs = await getRecommendSongs().catch(() => [])
    if (dailySongs.length) return dailySongs.slice(0, limit)
  }
  return getNewSongs(limit).catch(() => [])
}

const replaceSpecialRecommendResult = async(playlists: LX.Netease.Playlist[], cookie: string) => {
  await Promise.all(playlists.map(async playlist => {
    if (!specialPlaylistIds.has(playlist.id)) return
    const detail = await getPlaylistSummary(playlist.id, cookie)
    if (!detail) return
    if (detail.name) playlist.name = detail.name
    if (detail.img) playlist.img = detail.img
  }))
}

const filterPublicRecommendPlaylists = (playlists: LX.Netease.Playlist[]) => {
  return playlists.filter(playlist => !publicPrivateRadarPlaylistIds.has(playlist.id))
}

const getHomeRecommendPlaylists = async(
  blocks: AnyObject[],
  cookie: string,
  limit: number,
  forceRefresh = false,
): Promise<LX.Netease.Playlist[]> => {
  let recommendPlaylists = parseHomepagePlaylistBlock(blocks, HOME_BLOCK_CODES.legacyRecommendPlaylists, limit)
  if (!recommendPlaylists.length) {
    const recommendBlocks = await getHomepageBatchBlocks(cookie, forceRefresh, [HOME_BLOCK_CODES.legacyRecommendPlaylists]).catch(() => [])
    recommendPlaylists = parseHomepagePlaylistBlock(recommendBlocks, HOME_BLOCK_CODES.legacyRecommendPlaylists, limit)
  }
  if (!recommendPlaylists.length) {
    const fallbackBlocks = await getHomepageBlocks(cookie, forceRefresh, [HOME_BLOCK_CODES.legacyRecommendPlaylists]).catch(() => [])
    recommendPlaylists = parseHomepagePlaylistBlock(fallbackBlocks, HOME_BLOCK_CODES.legacyRecommendPlaylists, limit)
  }
  if (recommendPlaylists.length) return recommendPlaylists
  return getRecommendPlaylists(limit, true).catch(() => [])
}

export const getRecommendPlaylists = async(limit = 12, removePrivateRecommend = false): Promise<LX.Netease.Playlist[]> => {
  const cookie = await getCookie()
  const personalizedPromise = requestWeapi<AnyObject>('/weapi/personalized/playlist', { limit, total: true }, cookie).catch(() => null)
  if (!cookie) {
    const personalized = await personalizedPromise
    return normalizePlaylistList(asObjectArray(personalized?.result ?? personalized?.playlists)).slice(0, limit)
  }
  const privateList = cookie
    ? await requestWeapi<AnyObject>('/weapi/v1/discovery/recommend/resource', { timestamp: Date.now() }, cookie).catch(() => null)
    : null
  const personalized = await personalizedPromise
  let privateRecommend = normalizePlaylistList(asObjectArray(privateList?.recommend))
  if (privateRecommend.length) {
    if (removePrivateRecommend) privateRecommend = privateRecommend.slice(1)
    await replaceSpecialRecommendResult(privateRecommend, cookie)
  }

  return (mergeNeteasePlaylists([
    ...privateRecommend,
    ...filterPublicRecommendPlaylists(normalizePlaylistList(asObjectArray(personalized?.result ?? personalized?.playlists))),
  ]) as LX.Netease.Playlist[]).slice(0, limit)
}

export const getNewSongs = async(limit = 12): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = await getCookie()
  const body = await requestWeapi<AnyObject>('/weapi/personalized/newsong', { limit, areaId: 0, total: true }, cookie)
  assertOk(body, 'Failed to load new songs')
  const songs = asObjectArray(body.result).map(item => asOptionalObject(item.song) ?? item)
  return normalizeSongs(songs, [])
}

export const getCharts = async(limit = 8): Promise<LX.Netease.HomeChart[]> => {
  const cookie = await getCookie()
  const body = await requestWeapi<AnyObject>('/weapi/toplist/detail', {}, cookie)
  assertOk(body, 'Failed to load charts')
  return asObjectArray(body.list).slice(0, limit).map(item => ({
    id: String(item.id),
    name: item.name ?? '',
    img: item.coverImgUrl ?? '',
    desc: item.description ?? item.updateFrequency ?? null,
    play_count: formatPlayCount(Number(item.playCount ?? 0)),
    updateFrequency: item.updateFrequency ?? '',
    source: 'wy',
    songs: asObjectArray(item.tracks).map(track => ({
      name: track.first ?? '',
      singer: track.second ?? '',
    })),
  }))
}

export const getHomeRecommendation = async(params: LX.Netease.HomeRecommendationParams = {}): Promise<LX.Netease.HomeRecommendation> => {
  const sectionSet = new Set(params.sections ?? ['radarPlaylists', 'styleSongs', 'dailySongCategories', 'similarSongs', 'recommendPlaylists', 'charts'])
  const needRadarPlaylists = sectionSet.has('radarPlaylists')
  const needStyleSongs = sectionSet.has('styleSongs')
  const needDailySongCategories = sectionSet.has('dailySongCategories')
  const needSimilarSongs = sectionSet.has('similarSongs')
  const needRecommendPlaylists = sectionSet.has('recommendPlaylists')
  const needCharts = sectionSet.has('charts')
  const blockCodes: string[] = []
  if (needStyleSongs) blockCodes.push(HOME_BLOCK_CODES.styleSongs)
  if (needSimilarSongs) blockCodes.push(HOME_BLOCK_CODES.similarSongs)
  if (needRecommendPlaylists) blockCodes.push(HOME_BLOCK_CODES.legacyRecommendPlaylists)
  const playlistLimit = Math.max(6, params.playlistLimit ?? 12)
  const songLimit = Math.max(6, params.songLimit ?? 12)
  const cookie = await getCookie()
  const batchResult = blockCodes.length || needRadarPlaylists
    ? await getHomeBatchBlocks(cookie, !!params.forceRefresh, blockCodes, needRadarPlaylists).catch(() => ({ homepageBlocks: [], pcCustomizeBlocks: [] }))
    : { homepageBlocks: [], pcCustomizeBlocks: [] }

  const [radarPlaylists, styleSongSection, dailySongCategoryPlaylists, recommendPlaylists, similarSongs, charts] = await Promise.all([
    needRadarPlaylists
      ? getHomeRadarPlaylists(batchResult.pcCustomizeBlocks, cookie, playlistLimit, !!params.forceRefresh).catch(() => [])
      : Promise.resolve<LX.Netease.Playlist[]>([]),
    needStyleSongs
      ? getHomeStyleSongs(batchResult.homepageBlocks, cookie, songLimit, !!params.forceRefresh)
      : Promise.resolve({ title: '', songs: [] as LX.Music.MusicInfoOnline[] }),
    needDailySongCategories && cookie
      ? getDailySongCategoryPlaylists().catch(() => [])
      : Promise.resolve<LX.Netease.Playlist[]>([]),
    needRecommendPlaylists
      ? getHomeRecommendPlaylists(batchResult.homepageBlocks, cookie, playlistLimit, !!params.forceRefresh).catch(() => [])
      : Promise.resolve<LX.Netease.Playlist[]>([]),
    needSimilarSongs
      ? getHomeSimilarSongs(batchResult.homepageBlocks, cookie, songLimit, !!params.forceRefresh).catch(() => [])
      : Promise.resolve<LX.Music.MusicInfoOnline[]>([]),
    needCharts
      ? getCharts(8).catch(() => [])
      : Promise.resolve<LX.Netease.HomeChart[]>([]),
  ])
  return {
    radarPlaylists,
    styleSongsTitle: styleSongSection.title,
    styleSongs: styleSongSection.songs,
    dailySongCategoryPlaylists,
    similarSongs,
    recommendPlaylists,
    charts,
    updatedAt: Date.now(),
  }
}

const getSongDetailList = async(ids: string[], cookie: string): Promise<{ songs: AnyObject[], privileges: AnyObject[] }> => {
  const songs: AnyObject[] = []
  const privileges: AnyObject[] = []
  for (let index = 0; index < ids.length; index += playlistDetailLimit) {
    const chunkIds = ids.slice(index, index + playlistDetailLimit)
    const body = await requestWeapi<AnyObject>('/weapi/v3/song/detail', {
      c: `[${chunkIds.map(id => `{"id":${id}}`).join(',')}]`,
      ids: `[${chunkIds.join(',')}]`,
    }, cookie)
    assertOk(body, 'Failed to load song details')
    songs.push(...asObjectArray(body.songs))
    privileges.push(...asObjectArray(body.privileges))
  }
  return { songs, privileges }
}

export const getPlaylistDetail = async(id: string, page = 1, pageLimit = playlistDetailPageLimit): Promise<LX.Netease.PlaylistDetailInfo> => {
  page = Math.max(1, Math.floor(Number(page) || 1))
  pageLimit = Math.max(1, Math.min(playlistDetailLimit, Math.floor(Number(pageLimit) || playlistDetailPageLimit)))
  const cookie = await getCookie()
  const body = await requestWeapi<AnyObject>('/weapi/v3/playlist/detail', {
    id,
    n: playlistDetailLimit,
    s: 8,
  }, cookie)
  assertOk(body, 'Failed to load playlist detail')

  const playlist = asObject(body.playlist)
  const trackIds: string[] = asObjectArray(playlist.trackIds)
    .map(track => String(track.id))
    .filter(id => /^\d+$/.test(id))
  const pageIds = trackIds.slice((page - 1) * pageLimit, page * pageLimit)
  const detail: { songs: AnyObject[], privileges: AnyObject[] } = pageIds.length
    ? await getSongDetailList(pageIds, cookie)
    : { songs: asObjectArray(playlist.tracks), privileges: asObjectArray(body.privileges) }
  const normalizedPlaylist = normalizePlaylist(playlist)

  return {
    list: normalizeSongs(detail.songs, detail.privileges),
    source: 'wy',
    desc: playlist.description ?? null,
    total: trackIds.length || playlist.trackCount || detail.songs.length,
    page,
    limit: pageLimit,
    key: null,
    id: String(id),
    info: {
      name: playlist.name,
      img: playlist.coverImgUrl,
      desc: playlist.description,
      author: playlist.creator?.nickname,
      play_count: normalizedPlaylist?.play_count,
    },
    noItemLabel: '',
  }
}

export const getDailyRecommendPlaylistDetail = async(page = 1): Promise<LX.Netease.PlaylistDetailInfo> => {
  const list = await getRecommendSongs()
  const firstSong = list[0]
  return {
    list,
    source: 'wy',
    desc: null,
    total: list.length,
    page,
    limit: list.length,
    key: null,
    id: DAILY_RECOMMEND_CARD_ID,
    info: {
      name: '每日推荐',
      img: firstSong?.meta.picUrl ?? '',
      desc: null,
      author: firstSong?.singer ?? '',
    },
    noItemLabel: '',
  }
}

export const getDailySongCategoryPlaylistDetail = async(categoryId: string, tagId: string, page = 1): Promise<LX.Netease.PlaylistDetailInfo> => {
  const list = await getDailySongCategorySongs(categoryId, tagId)
  const firstSong = list[0]
  return {
    list,
    source: 'wy',
    desc: null,
    total: list.length,
    page,
    limit: list.length,
    key: null,
    id: getDailySongCategoryPlaylistId(categoryId, tagId),
    info: {
      name: '',
      img: firstSong?.meta.picUrl ?? '',
      desc: null,
    },
    noItemLabel: '',
  }
}

export const likeMusic = async(musicInfo: LX.Music.MusicInfo, like = true) => {
  const cookie = await getCookie(true)
  const id = getSongId(musicInfo)
  const body = await requestWeapi<AnyObject>(`/weapi/radio/like?alg=itembased&trackId=${id}&like=${like}&time=${Date.now()}`, {}, cookie)
  assertOk(body, 'Failed to sync like')
  return body
}

export const trashPrivateFmMusic = async(params: LX.Netease.PrivateFmTrashParams | LX.Music.MusicInfo) => {
  const cookie = await getCookie(true)
  const musicInfo = 'musicInfo' in params ? params.musicInfo : params
  const time = 'time' in params ? params.time ?? Date.now() : Date.now()
  const id = getSongId(musicInfo)
  const body = await requestWeapi<AnyObject>(`/weapi/radio/trash/add?alg=RT&songId=${id}&time=${time}`, {}, cookie)
  assertOk(body, 'Failed to trash private FM song')
  return body
}

const qualityLevelMap: Partial<Record<LX.Quality, string>> = {
  '128k': 'standard',
  '192k': 'higher',
  '320k': 'exhigh',
  flac: 'lossless',
  flac24bit: 'hires',
}

export const getMusicUrl = async({ musicInfo, quality }: LX.Netease.MusicUrlParams): Promise<string> => {
  const cookie = await getCookie()
  const id = getSongId(musicInfo)
  const level = qualityLevelMap[quality] ?? 'standard'
  const body = await requestWeapi<AnyObject>('/weapi/song/enhance/player/url/v1', {
    ids: [Number(id)],
    level,
    encodeType: 'flac',
  }, cookie)
  assertOk(body, 'Failed to load WY music URL')
  return body.data?.[0]?.url ?? ''
}
