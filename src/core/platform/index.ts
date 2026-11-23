import { NativeModules } from 'react-native'
import { createAccountSession, StaleAccountError, type PlatformProfile } from './session'
import { credentialStorage } from './credentials'
import { platformFetch } from './http'
import { getQQMusicAccountUin, getCookieValue } from './qq/auth'
import { createQQMusicSongService } from './qq/song'
import { createQQMusicDailyRecommendService } from './qq/dailyRecommend'
import { createQQMusicHomeRecommendService } from './qq/homeRecommend'
import { createQQMusicPlaylistDetailService } from './qq/playlistDetail'
import { createQQMusicUserPlaylistService } from './qq/userPlaylists'
import { createQQMusicFeedbackService } from './qq/feedback'
import { createQQMusicCredentialService } from './qq/credential'
import { createKugouApiClient } from './kugou/api'
import { createKugouRecommendationService, normalizeKugouSong } from './kugou/recommend'
import { createKugouUserPlaylistService } from './kugou/userPlaylists'
import * as netease from '@/core/netease'
import { setNeteaseAccountStatus } from '@/store/netease/action'
import musicSdk from '@/utils/musicSdk'
import { createLoginQrImage } from '@/core/netease/helpers'
import { toNewMusicInfo } from '@/utils'

export type Provider = LX.PlatformPlaylistProvider
export interface PlatformStatus { loggedIn: boolean, profile: PlatformProfile | null, unavailable?: boolean }
export const providers: Array<{ id: Provider, name: string }> = [{ id: 'netease', name: '网易云' }, { id: 'qq_music', name: 'QQ 音乐' }, { id: 'kugou', name: '酷狗' }]
const listeners = new Set<() => void>()
let revision = 0
const changed = () => { revision++; for (const listener of listeners) listener() }
export const subscribeAccounts = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getAccountRevision = () => revision
const sessions = {
  qq_music: createAccountSession('qq_music', credentialStorage, changed),
  kugou: createAccountSession('kugou', credentialStorage, changed),
}
const activeLogins: Record<'qq_music' | 'kugou', number | null> = { qq_music: null, kugou: null }
let neteaseStatus: PlatformStatus = { loggedIn: false, profile: null }
export const getPlatformStatus = (provider: Provider): PlatformStatus => provider == 'netease' ? neteaseStatus : sessions[provider].status()
export const generation = (provider: Provider): number => provider == 'netease' ? netease.getNeteaseAccountGeneration() : sessions[provider].generation()
export const assertGeneration = (provider: Provider, expected: number) => { if (generation(provider) != expected) throw new StaleAccountError() }

export const initPlatformAccount = async(provider: Provider) => {
  if (provider != 'netease') return sessions[provider].initialize()
  const expected = generation(provider)
  const status = await netease.getAccountStatus()
  assertGeneration(provider, expected)
  neteaseStatus = {
    loggedIn: status.isLoggedIn,
    profile: status.profile ? { id: String(status.profile.userId), nickname: status.profile.nickname, avatarUrl: status.profile.avatarUrl } : null,
  }
  changed()
}
const qqOptions = { fetchImpl: platformFetch, getCookie: () => sessions.qq_music.account()?.cookie ?? '' }
const qqSongs = createQQMusicSongService(qqOptions)
const qqDaily = createQQMusicDailyRecommendService(qqOptions)
const qqHome = createQQMusicHomeRecommendService(qqOptions)
const qqDetail = createQQMusicPlaylistDetailService(qqOptions)
const qqFeedback = createQQMusicFeedbackService(qqOptions)
const qqCredentials = createQQMusicCredentialService({ fetchImpl: platformFetch })
const qqPlaylists = createQQMusicUserPlaylistService({
  ...qqOptions,
  getProfile: () => {
    const profile = sessions.qq_music.account()?.profile
    return profile ? { uin: profile.id, nickname: profile.nickname } : null
  },
})
const kgApi = createKugouApiClient()
const kgOptions = { api: kgApi, getCookie: () => sessions.kugou.account()?.cookie ?? '' }
// Authentication errors are handled by the outer generation guard, so a late error cannot log out a new account.
const kgRecommend = createKugouRecommendationService(kgOptions)
const kgPlaylists = createKugouUserPlaylistService({
  ...kgOptions,
  getProfile: () => {
    const profile = sessions.kugou.account()?.profile
    return profile ? { userId: profile.id, nickname: profile.nickname } : null
  },
})
let refreshQQ: { generation: number, promise: Promise<void> } | null = null
const refreshQQCredentials = async(force = false) => {
  const expected = sessions.qq_music.generation()
  if (refreshQQ?.generation == expected) return refreshQQ.promise
  const account = sessions.qq_music.account()
  if (!account) return
  const due = qqCredentials.getRefreshDueAt(account.cookie)
  if (!force && (due == null || due > Date.now())) return
  const promise = (async() => {
    const cookie = await qqCredentials.refresh(account.cookie)
    await sessions.qq_music.save({ ...account, cookie, updatedAt: Date.now() }, expected)
  })()
  refreshQQ = { generation: expected, promise }
  try { await promise } finally { if (refreshQQ?.promise == promise) refreshQQ = null }
}
const isAuthError = (error: unknown) => ['QQMusicAuthError', 'KugouAuthError'].includes((error as Error)?.name) || (error as { kind?: string })?.kind == 'invalid'
export const accountCall = async<T>(provider: Provider, task: () => Promise<T>, allowRefresh = true, privateRequest = true): Promise<T> => {
  const expected = generation(provider)
  try {
    if (provider == 'qq_music') await refreshQQCredentials().catch(error => { if (isAuthError(error)) throw error })
    assertGeneration(provider, expected)
    const result = await task()
    assertGeneration(provider, expected)
    return result
  } catch (error) {
    assertGeneration(provider, expected)
    if (isAuthError(error) && privateRequest) {
      if (provider == 'qq_music' && allowRefresh) {
        try { await refreshQQCredentials(true) } catch (refreshError) {
          assertGeneration(provider, expected)
          if ((refreshError as { kind?: string })?.kind == 'transient') throw new Error('QQ 凭据续期暂时失败，请重试')
          await logoutPlatform(provider)
          throw new Error('QQ 登录已过期，请重新授权')
        }
        return accountCall(provider, task, false)
      }
      await logoutPlatform(provider)
      throw new Error('平台登录已失效，请重新登录')
    }
    throw error
  }
}

export const loginQQ = async(desktop = false) => {
  const expected = sessions.qq_music.invalidate()
  activeLogins.qq_music = expected
  try {
    await sessions.qq_music.initialize()
    sessions.qq_music.assertCurrent(expected)
    const cookie: string = await NativeModules.PlatformLogin.openQQ(desktop)
    sessions.qq_music.assertCurrent(expected)
    const id = getQQMusicAccountUin(cookie)
    if (!id) throw new Error('QQ 授权尚未返回有效音乐账号')
    const profile = { id, nickname: getCookieValue(cookie, 'psrf_qqusername') || `QQ ${id}` }
    // A QR scan / OAuth redirect alone is not proof of a usable QQ Music session.
    await createQQMusicUserPlaylistService({ fetchImpl: platformFetch, getCookie: () => cookie, getProfile: () => ({ uin: id, nickname: profile.nickname }) }).getUserPlaylists(['created'])
    await sessions.qq_music.save({ cookie, profile, updatedAt: Date.now() }, expected)
  } finally { if (activeLogins.qq_music == expected) activeLogins.qq_music = null }
}
let kgQr: { key: string, generation: number, expires: number } | null = null
export const createKugouLoginQr = async() => {
  const expected = sessions.kugou.invalidate()
  activeLogins.kugou = expected
  kgQr = null
  await sessions.kugou.initialize()
  sessions.kugou.assertCurrent(expected)
  const response = await kgApi.loginQrKey()
  sessions.kugou.assertCurrent(expected)
  const key = response.body?.data?.qrcode
  if (typeof key != 'string' || !key) throw new Error('酷狗二维码获取失败，请刷新')
  kgQr = { key, generation: expected, expires: Date.now() + 5 * 60000 }
  const url = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${encodeURIComponent(key)}`
  return { url, image: createLoginQrImage(url) }
}
export const checkKugouLoginQr = async(): Promise<'waiting' | 'scanned' | 'expired' | 'success'> => {
  const session = kgQr
  if (!session || session.expires <= Date.now()) return 'expired'
  sessions.kugou.assertCurrent(session.generation)
  const response = await kgApi.loginQrCheck({ key: session.key })
  sessions.kugou.assertCurrent(session.generation)
  const data = response.body?.data
  if (Number(data?.status) == 1) return 'waiting'
  if (Number(data?.status) == 2) return 'scanned'
  if (Number(data?.status) != 4) return 'expired'
  const id = String(data.userid ?? '')
  const token = String(data.token ?? '')
  if (!/^[1-9]\d*$/.test(id) || !token) throw new Error('酷狗授权未返回有效账号')
  const cookie = `userid=${id};token=${token}`
  const info = await kgApi.userInfo({ cookie })
  sessions.kugou.assertCurrent(session.generation)
  const profileData = info.body?.data?.userInfo ?? info.body?.data?.userinfo ?? info.body?.data?.info ?? info.body?.data
  const resultId = String(profileData?.userId ?? profileData?.userid ?? profileData?.user_id ?? profileData?.uid ?? '')
  if (Number(info.body?.status) != 1 || !resultId || resultId != id) throw new Error('酷狗账号校验失败，请重新扫码')
  await sessions.kugou.save({ cookie, profile: { id, nickname: String(profileData?.nickname ?? profileData?.username ?? id), avatarUrl: String(profileData?.pic ?? '') }, updatedAt: Date.now() }, session.generation)
  // The save validates the generation before committing; a replacement QR cannot reach here.
  // eslint-disable-next-line require-atomic-updates
  kgQr = null
  activeLogins.kugou = null
  return 'success'
}
export const cancelPlatformLogin = async(provider: Provider) => {
  if (provider == 'netease') { netease.cancelLoginQr(); return }
  if (activeLogins[provider] == null) return
  sessions[provider].invalidate()
  activeLogins[provider] = null
  if (provider == 'kugou') kgQr = null
  if (provider == 'qq_music') await NativeModules.PlatformLogin.cancel()
}
const logoutListeners = new Set<(provider: Provider) => void>()
export const onPlatformLogout = (listener: (provider: Provider) => void) => { logoutListeners.add(listener); return () => { logoutListeners.delete(listener) } }
export const logoutPlatform = async(provider: Provider) => {
  if (provider == 'netease') {
    neteaseStatus = { loggedIn: false, profile: null }
    setNeteaseAccountStatus({ isLoggedIn: false, profile: null })
    changed()
    await netease.logout()
  } else {
    activeLogins[provider] = null
    const logout = sessions[provider].logout()
    if (provider == 'qq_music') await NativeModules.PlatformLogin.cancel()
    if (provider == 'kugou') kgQr = null
    await logout
  }
  for (const listener of logoutListeners) listener(provider)
}
export const getPlatformPlaylists = async(provider: Provider, kind: LX.PlatformPlaylistKind) => accountCall(provider, async() => {
  if (provider == 'netease') return netease.getUserPlaylists([kind])
  return provider == 'qq_music' ? qqPlaylists.getUserPlaylists([kind]) : kgPlaylists.getUserPlaylists([kind])
})
export interface PlaylistPage { list: LX.Music.MusicInfo[], total: number, page: number, limit: number }
export const getPlatformPlaylistPage = async(provider: Provider, id: string, page: number): Promise<PlaylistPage> => accountCall(provider, async() => {
  if (provider == 'netease') return netease.getPlaylistDetail(id, page, 200)
  if (provider == 'qq_music') return qqDetail.getPlaylistDetail(id, page)
  if (id.startsWith('rank_')) {
    const response = await kgApi.rankAudio({ rankid: id.slice(5), page, pagesize: 100 })
    const data = response.body?.data
    const rows = data?.songs ?? data?.songlist ?? data?.info ?? data?.list
    if (Number(response.body?.status) != 1 || !Array.isArray(rows)) throw new Error('酷狗榜单读取失败')
    return { list: rows.map(normalizeKugouSong), total: Number(data?.total ?? data?.total_count ?? rows.length), page, limit: 100 }
  }
  const globalId = /^https:\/\//i.test(id) ? new URL(id).searchParams.get('global_collection_id') : null
  if (globalId) {
    const response = await kgApi.playlistTracks({ id: globalId, page, cookie: kgOptions.getCookie() })
    const data = response.body?.data
    const rows = data?.songs ?? data?.info ?? data?.list
    if (Number(response.body?.status) != 1 || !Array.isArray(rows)) throw new Error('酷狗歌单详情读取失败')
    return { list: rows.map(normalizeKugouSong), total: Number(data?.total ?? data?.count ?? rows.length), page, limit: 100 }
  }
  const detail = await musicSdk.kg.songList.getListDetail(id, page)
  return { ...detail, list: detail.list.map((item: any) => item.meta ? item : toNewMusicInfo(item)) }
})
export interface Recommendation { songs: LX.Music.MusicInfo[], playlists: Array<{ id: string, name: string, img: string }> }
export const recommendationModules = (provider: Provider): Array<{ id: string, title: string, private: boolean, continuous?: boolean }> => {
  if (provider == 'qq_music') return [{ id: 'guess', title: '猜你喜欢', private: true, continuous: true }, { id: 'daily', title: '每日 30 首', private: true }, { id: 'brush', title: '连续推荐', private: true, continuous: true }, { id: 'home', title: '推荐歌曲与歌单', private: true }]
  if (provider == 'kugou') return [{ id: 'public', title: '公开精选歌单', private: false }, { id: 'rank', title: '热门榜单', private: false }, { id: 'daily', title: '每日推荐', private: true }, { id: 'style', title: '风格推荐', private: true }, { id: 'fm', title: '私人 FM', private: true }]
  return []
}
export const getPlatformRecommendation = async(provider: Provider, module: string, continuation = false): Promise<Recommendation> => accountCall(provider, async() => {
  if (provider == 'qq_music') {
    if (module == 'guess') return { songs: await qqSongs.getGuessLikeSongs({ continuation }), playlists: [] }
    if (module == 'brush') return { songs: await qqSongs.getGuessLikeSongs({ continuation, radioMode: 'brush' }), playlists: [] }
    if (module == 'daily') return { songs: await qqDaily.getDailyRecommendSongs(), playlists: [] }
    const home = await qqHome.getHomeRecommendation()
    return { songs: home.relatedSongGroups.flat(), playlists: [...home.featuredPlaylists, ...home.privatePlaylists, ...home.guidePlaylists] }
  }
  if (module == 'public') return { songs: [], playlists: await kgRecommend.getPublicPlaylists() }
  if (module == 'rank') return { songs: [], playlists: (await kgRecommend.getRanks()).map(rank => ({ id: `rank_${rank.id}`, name: rank.name, img: rank.img })) }
  if (module == 'daily') return { songs: await kgRecommend.getDailyRecommendSongs(), playlists: [] }
  if (module == 'style') return { songs: await kgRecommend.getStyleRecommendation(), playlists: [] }
  return { songs: await kgRecommend.getPrivateFmSongs(), playlists: [] }
}, true, !(provider == 'kugou' && ['public', 'rank'].includes(module)))
export const platformFeedback = async(provider: Provider, song: LX.Music.MusicInfo, dislike = false) => accountCall(provider, async() => {
  if (provider == 'netease') { await netease.likeMusic(song); return }
  if (provider != 'qq_music' || song.source != 'tx') throw new Error('此平台未提供该操作')
  if (dislike) await qqFeedback.dislikeMusic(song)
  else await qqFeedback.likeMusic(song)
})
