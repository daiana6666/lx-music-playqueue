import playerState from '@/store/player/state'
import { beginListeningSession, acceptListeningSession, addListeningTime, normalizeListeningTimeStats } from '@/core/netease/helpers'
import { getListeningTimeStats, saveListeningTimeStats } from '@/utils/data'
import { throttle } from '@/utils/common'
import state from './state'

const saveListeningTimeStatsThrottle = throttle(() => {
  void saveListeningTimeStats(state.listeningTimeStats)
}, 2000)

export const initListeningTimeStats = async() => {
  if (state.isListeningTimeInited) return state.listeningTimeStats
  state.listeningTimeStats = normalizeListeningTimeStats(await getListeningTimeStats())
  state.isListeningTimeInited = true
  global.state_event.listeningTimeStatsUpdated({ ...state.listeningTimeStats })
  return state.listeningTimeStats
}

export const beginCurrentListeningSession = (musicInfo: LX.Player.PlayMusic | null, restore = false) => {
  beginListeningSession(state.listeningTimeStats, musicInfo, restore)
  void saveListeningTimeStats(state.listeningTimeStats)
}
export const getCurrentListeningSessionId = () => state.listeningTimeStats.activeSession?.id
export const acceptCurrentListeningSession = (sessionId: string | undefined) => {
  if (!sessionId || !acceptListeningSession(state.listeningTimeStats, playerState.playMusicInfo.musicInfo, sessionId)) return
  void saveListeningTimeStats(state.listeningTimeStats)
  global.state_event.listeningTimeStatsUpdated({ ...state.listeningTimeStats })
}

export const addCurrentListeningTime = (seconds: number, musicInfo = playerState.playMusicInfo.musicInfo) => {
  if (!musicInfo) return state.listeningTimeStats
  addListeningTime(state.listeningTimeStats, seconds, musicInfo)
  saveListeningTimeStatsThrottle()
  global.state_event.listeningTimeStatsUpdated({ ...state.listeningTimeStats })
  return state.listeningTimeStats
}

export const saveListeningTimeStatsNow = async() => {
  await saveListeningTimeStats(state.listeningTimeStats)
}

export default {
  initListeningTimeStats,
  addCurrentListeningTime,
  saveListeningTimeStatsNow,
}
