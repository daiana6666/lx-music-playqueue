import { getPrivateFm, trashPrivateFmMusic as trashMusic } from '@/core/netease'
import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import state from './state'
import { LIST_IDS } from '@/config/constant'
import { appendUniqueMusicInfos, getMusicIdentity } from './helpers'

export const PRIVATE_FM_TEMP_LIST_ID = 'wy_private_fm'
let preparePrivateFmPromise: Promise<LX.Music.MusicInfoOnline[]> | null = null
let appendNextSongsPromise: Promise<LX.Music.MusicInfoOnline[]> | null = null
let platformRadio: { provider: string, load: () => Promise<LX.Music.MusicInfoOnline[]>, current: () => boolean, dislike?: (song: LX.Music.MusicInfo) => Promise<void> } | null = null
let radioGeneration = 0
const replaceRadioRequests = () => {
  radioGeneration++
  preparePrivateFmPromise = null
  appendNextSongsPromise = null
  state.isLoadingPrivateFm = false
}

export const enterPlatformRadio = async(options: NonNullable<typeof platformRadio>, songs: LX.Music.MusicInfoOnline[]) => {
  replaceRadioRequests()
  const expected = radioGeneration
  platformRadio = options
  state.privateFmList = songs
  state.isPrivateFmActive = true
  await setTempList(PRIVATE_FM_TEMP_LIST_ID, songs)
  if (expected != radioGeneration || !options.current()) return
  emitPrivateFmState()
  await playList(LIST_IDS.TEMP, 0)
}
export const exitPlatformRadio = (provider: string) => {
  if (platformRadio?.provider == provider) exitPrivateFmMode()
}

export const privateFmModes: Array<{ id: LX.Netease.PrivateFmModeId, name: string }> = [
  { id: 'DEFAULT', name: 'Default' },
  { id: 'FAMILIAR', name: 'Familiar' },
  { id: 'EXPLORE', name: 'Explore' },
  { id: 'EXERCISE', name: 'Exercise' },
  { id: 'FOCUS', name: 'Focus' },
  { id: 'NIGHT_EMO', name: 'Night' },
]

const emitPrivateFmState = () => {
  global.state_event.privateFmUpdated({ ...state })
}

export const setPrivateFmMode = (mode: LX.Netease.PrivateFmModeId) => {
  state.privateFmMode = mode
  emitPrivateFmState()
}

export const preparePrivateFmQueue = async(force = false) => {
  if (preparePrivateFmPromise) return preparePrivateFmPromise
  if (appendNextSongsPromise) return appendNextSongsPromise
  if (state.privateFmList.length && (!force || state.isPrivateFmActive)) return state.privateFmList
  state.isLoadingPrivateFm = true
  emitPrivateFmState()
  const expected = radioGeneration
  const promise = (async() => {
    const songs = await getPrivateFm({ mode: state.privateFmMode, limit: 3 })
    if (expected != radioGeneration || platformRadio) return state.privateFmList
    state.privateFmList = songs
    return state.privateFmList
  })()
  preparePrivateFmPromise = promise
  return promise.finally(() => {
    if (preparePrivateFmPromise == promise) {
      preparePrivateFmPromise = null
      state.isLoadingPrivateFm = false
      emitPrivateFmState()
    }
  })
}

export const enterPrivateFmMode = async(index = 0) => {
  if (platformRadio) {
    platformRadio = null
    replaceRadioRequests()
    state.isPrivateFmActive = false
    state.privateFmList = []
  }
  const expected = radioGeneration
  await preparePrivateFmQueue(true)
  if (expected != radioGeneration) return
  await setTempList(PRIVATE_FM_TEMP_LIST_ID, state.privateFmList)
  if (expected != radioGeneration) return
  state.isPrivateFmActive = true
  emitPrivateFmState()
  await playList(LIST_IDS.TEMP, index)
}

export const exitPrivateFmMode = () => {
  replaceRadioRequests()
  platformRadio = null
  if (!state.isPrivateFmActive) return
  state.isPrivateFmActive = false
  emitPrivateFmState()
}

export const ensurePrivateFmNextSongs = async(currentMusicInfo?: LX.Music.MusicInfo | null) => {
  if (!state.isPrivateFmActive) return state.privateFmList
  const currentIndex = currentMusicInfo
    ? state.privateFmList.findIndex(item => getMusicIdentity(item) == getMusicIdentity(currentMusicInfo))
    : -1
  if (currentIndex < 0 || state.privateFmList.length - currentIndex > 2) return state.privateFmList
  if (appendNextSongsPromise) return appendNextSongsPromise
  if (state.isLoadingPrivateFm) return state.privateFmList

  state.isLoadingPrivateFm = true
  emitPrivateFmState()
  const requestMode = state.privateFmMode
  const expected = radioGeneration
  const radio = platformRadio
  const promise = (async() => {
    const nextSongs = radio ? await radio.load() : await getPrivateFm({ mode: requestMode, limit: 3 })
    if (!state.isPrivateFmActive || state.privateFmMode != requestMode || expected != radioGeneration || (radio && !radio.current())) return state.privateFmList
    const nextList = appendUniqueMusicInfos(state.privateFmList, nextSongs)
    if (nextList.length != state.privateFmList.length) {
      state.privateFmList = nextList
      await setTempList(PRIVATE_FM_TEMP_LIST_ID, state.privateFmList)
    }
    return state.privateFmList
  })()
  appendNextSongsPromise = promise
  return promise.finally(() => {
    if (appendNextSongsPromise == promise) {
      appendNextSongsPromise = null
      state.isLoadingPrivateFm = false
      emitPrivateFmState()
    }
  })
}

export const trashPrivateFmMusic = async(musicInfo: LX.Music.MusicInfo) => {
  const expected = radioGeneration
  if (platformRadio) {
    if (!platformRadio.dislike) throw new Error('当前平台未提供 FM 负反馈')
    await platformRadio.dislike(musicInfo)
  } else await trashMusic({ musicInfo })
  if (expected != radioGeneration) return
  state.privateFmList = state.privateFmList.filter(item => item.id != musicInfo.id)
  await setTempList(PRIVATE_FM_TEMP_LIST_ID, state.privateFmList)
  emitPrivateFmState()
}

export default {
  PRIVATE_FM_TEMP_LIST_ID,
  privateFmModes,
  preparePrivateFmQueue,
  enterPrivateFmMode,
  exitPrivateFmMode,
  ensurePrivateFmNextSongs,
  setPrivateFmMode,
  trashPrivateFmMusic,
}
