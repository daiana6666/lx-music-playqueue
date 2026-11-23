import { getDailyRecommendPlaylistDetail, getDailySongCategoryPlaylistDetail, getRecommendSongs } from '@/core/netease'
import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { parseDailySongCategoryPlaylistId } from '@/core/netease/helpers'
import state from './state'
import { LIST_IDS } from '@/config/constant'

export const DAILY_RECOMMEND_TEMP_LIST_ID = 'wy_daily_recommend'
let loadDailyRecommendPromise: Promise<LX.Music.MusicInfoOnline[]> | null = null

export const loadDailyRecommendSongs = async(force = false) => {
  if (loadDailyRecommendPromise) return loadDailyRecommendPromise
  if (state.dailyRecommendList.length && !force) return state.dailyRecommendList
  state.isLoadingDailyRecommend = true
  const promise = (async() => {
    state.dailyRecommendList = await getRecommendSongs()
    return state.dailyRecommendList
  })()
  loadDailyRecommendPromise = promise
  return promise.finally(() => {
    if (loadDailyRecommendPromise == promise) loadDailyRecommendPromise = null
    state.isLoadingDailyRecommend = false
  })
}

export const syncDailyRecommendTempList = async(force = false) => {
  const list = await loadDailyRecommendSongs(force)
  await setTempList(DAILY_RECOMMEND_TEMP_LIST_ID, list)
  return list
}

export const playDailyRecommend = async(index = 0) => {
  await syncDailyRecommendTempList()
  await playList(LIST_IDS.TEMP, index)
}

export const getDailyRecommendDetail = async(page = 1) => {
  return getDailyRecommendPlaylistDetail(page)
}

export const getVirtualDailyPlaylistDetail = async(id: string, page = 1) => {
  if (id == DAILY_RECOMMEND_TEMP_LIST_ID) return getDailyRecommendPlaylistDetail(page)
  const parsed = parseDailySongCategoryPlaylistId(id)
  if (!parsed) return null
  return getDailySongCategoryPlaylistDetail(parsed.categoryId, parsed.tagId, page)
}

export default {
  DAILY_RECOMMEND_TEMP_LIST_ID,
  loadDailyRecommendSongs,
  syncDailyRecommendTempList,
  playDailyRecommend,
  getDailyRecommendDetail,
  getVirtualDailyPlaylistDetail,
}
