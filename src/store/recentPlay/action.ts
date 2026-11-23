import { createRecentPlayList, normalizeRecentPlayList } from '@/core/netease/helpers'
import { getRecentPlayList, saveRecentPlayList } from '@/utils/data'
import { throttle } from '@/utils/common'
import state from './state'

const saveRecentPlayListThrottle = throttle(() => {
  void saveRecentPlayList(state.recentPlayList)
}, 1000)

export const initRecentPlayList = async() => {
  if (state.isRecentPlayInited) return state.recentPlayList
  state.recentPlayList = normalizeRecentPlayList(await getRecentPlayList(), 520)
  state.isRecentPlayInited = true
  global.state_event.recentPlayListUpdated([...state.recentPlayList])
  return state.recentPlayList
}

export const addRecentPlayMusic = (musicInfo: LX.Music.MusicInfo) => {
  state.recentPlayList = createRecentPlayList(state.recentPlayList, musicInfo, 520)
  saveRecentPlayListThrottle()
  global.state_event.recentPlayListUpdated([...state.recentPlayList])
}

export default {
  initRecentPlayList,
  addRecentPlayMusic,
}
