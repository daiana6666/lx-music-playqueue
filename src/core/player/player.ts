import { getCurrentListeningSessionId } from '@/store/listeningTime/action'
import { playbackCoordinator } from '@/core/music/playbackSession'
import { isInitialized, initial as playerInitial, isEmpty, setPause, setPlay, setResource, setStop } from '@/plugins/player'
import {
  setStatusText,
} from '@/core/player/playStatus'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import {
  getList,
  setPlayMusicInfo,
  setMusicInfo,
  setPlayListId,
} from '@/core/player/playInfo'
import {
  clearPlayedList,
  addPlayedList,
  removePlayedList,
} from '@/core/player/playedList'
import {
  clearTempPlayeList,
  removeTempPlayList,
} from '@/core/player/tempPlayList'
import { getMusicUrl, getPicPath, getLyricInfo } from '@/core/music'
import { requestMsg } from '@/utils/message'
import { getRandom } from '@/utils/common'
import { filterList } from './utils'
import BackgroundTimer from 'react-native-background-timer'
import { checkIgnoringBatteryOptimization, checkNotificationPermission, debounceBackgroundTimer } from '@/utils/tools'
import { LIST_IDS } from '@/config/constant'
import { addListMusics, removeListMusics } from '@/core/list'
import { addDislikeInfo } from '@/core/dislikeList'
import partyState from '@/store/party/state'
import type { PlayerResourceInput } from '@/plugins/player/utils'
import musicSdk, { findMusic } from '@/utils/musicSdk'
import { toNewMusicInfo } from '@/utils'
import { ensurePrivateFmNextSongs, exitPrivateFmMode, PRIVATE_FM_TEMP_LIST_ID } from '@/store/privateFm/action'
import privateFmState from '@/store/privateFm/state'
import listState from '@/store/list/state'
import {
  createGettingUrlId,
  createPlayerMusicIdentity,
  getTargetMusicInfo,
  resolveProjectSourceResource,
  shouldClearGettingUrlId,
  shouldUseProjectSourceOnly,
} from './helpers'

interface SetMusicUrlOptions {
  isRefresh?: boolean
  startTime?: number
}

interface PlayMusicOptions extends SetMusicUrlOptions {
  listId?: string | null
  isTempPlay?: boolean
  clearTempList?: boolean
}

const normalizeSetMusicUrlOptions = (options?: boolean | SetMusicUrlOptions): Required<SetMusicUrlOptions> => {
  if (typeof options === 'boolean') {
    return {
      isRefresh: options,
      startTime: playerState.progress.nowPlayTime,
    }
  }
  return {
    isRefresh: options?.isRefresh ?? false,
    startTime: options?.startTime ?? playerState.progress.nowPlayTime,
  }
}

const normalizePlayMusicOptions = (options?: PlayMusicOptions): Required<PlayMusicOptions> => {
  return {
    isRefresh: options?.isRefresh ?? false,
    startTime: options?.startTime ?? 0,
    listId: options?.listId ?? null,
    isTempPlay: options?.isTempPlay ?? true,
    clearTempList: options?.clearTempList ?? true,
  }
}

const createMusicIdentity = (musicInfo: LX.Player.PlayMusic | LX.Music.MusicInfo | null) => {
  return createPlayerMusicIdentity(musicInfo)
}

const isSameMusicIdentity = (
  left: LX.Player.PlayMusic | LX.Music.MusicInfo | LX.Download.ListItem | null | undefined,
  right: LX.Player.PlayMusic | LX.Music.MusicInfo | LX.Download.ListItem | null | undefined,
) => createPlayerMusicIdentity(left ?? null) === createPlayerMusicIdentity(right ?? null)

const getPartyQueueCurrentIndex = () => {
  const room = partyState.room
  if (!room?.playback.queue.length) return -1
  const currentIdentity = createMusicIdentity(playerState.playMusicInfo.musicInfo)
  if (!currentIdentity) return room.playback.currentIndex
  if (createMusicIdentity(room.playback.queue[room.playback.currentIndex]?.musicInfo) == currentIdentity) return room.playback.currentIndex
  const currentIndex = room.playback.queue.findIndex(item => createMusicIdentity(item.musicInfo) === currentIdentity)
  return currentIndex > -1 ? currentIndex : room.playback.currentIndex
}

const getPartyQueuePlayMusicInfo = (offset: number): LX.Player.PlayMusicInfo | null => {
  const room = partyState.room
  if (!room?.playback.queue.length) return null

  const currentIndex = getPartyQueueCurrentIndex()
  let nextIndex = currentIndex
  if (currentIndex < 0) {
    if (offset < 0) return null
    nextIndex = 0
  } else {
    nextIndex += offset
  }
  if (nextIndex < 0 || nextIndex >= room.playback.queue.length) return null

  return {
    listId: null,
    musicInfo: room.playback.queue[nextIndex].musicInfo,
    isTempPlay: true,
  } as unknown as LX.Player.PlayMusicInfo
}

// import { checkMusicFileAvailable } from '@renderer/utils/music'

const createDelayNextTimeout = (delay: number) => {
  let timeout: number | null
  const clearDelayNextTimeout = () => {
    // console.log(this.timeout)
    if (timeout) {
      BackgroundTimer.clearTimeout(timeout)
      timeout = null
    }
  }

  const addDelayNextTimeout = () => {
    clearDelayNextTimeout()
    timeout = BackgroundTimer.setTimeout(() => {
      timeout = null
      if (global.lx.isPlayedStop) return
      console.log('delay next timeout timeout', delay)
      void playNext(true)
    }, delay)
  }

  return {
    clearDelayNextTimeout,
    addDelayNextTimeout,
  }
}
const { addDelayNextTimeout, clearDelayNextTimeout } = createDelayNextTimeout(5000)
const { addDelayNextTimeout: addLoadTimeout, clearDelayNextTimeout: clearLoadTimeout } = createDelayNextTimeout(100000)

/**
 * 检查音乐信息是否已更改
 */
const diffCurrentMusicInfo = (curMusicInfo: LX.Music.MusicInfo | LX.Download.ListItem): boolean => {
  // return curMusicInfo !== playerState.playMusicInfo.musicInfo || playerState.isPlay
  return createGettingUrlId(curMusicInfo) != global.lx.gettingUrlId || !isSameMusicIdentity(curMusicInfo, playerState.playMusicInfo.musicInfo) || playerState.isPlay
}

let cancelDelayRetry: (() => void) | null = null
const delayRetry = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, isRefresh = false): Promise<PlayerResourceInput | null> => {
  // if (cancelDelayRetry) cancelDelayRetry()
  return new Promise<PlayerResourceInput | null>((resolve, reject) => {
    const time = getRandom(2, 6)
    setStatusText(global.i18n.t('player__getting_url_delay_retry', { time }))
    const tiemout = setTimeout(() => {
      getMusicPlayUrl(musicInfo, isRefresh, true).then((result) => {
        cancelDelayRetry = null
        resolve(result)
      }).catch(async(err: any) => {
        cancelDelayRetry = null
        reject(err)
      })
    }, time * 1000)
    cancelDelayRetry = () => {
      clearTimeout(tiemout)
      cancelDelayRetry = null
      resolve(null)
    }
  })
}

const getProjectSourceResource = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, isRefresh: boolean, signal?: AbortSignal) => {
  const targetMusicInfo = getTargetMusicInfo(musicInfo)
  const result = await resolveProjectSourceResource({
    cachedMusicInfo: targetMusicInfo.meta.toggleMusicInfo,
    getMatchedList: async() => findMusic({
      name: targetMusicInfo.name,
      singer: targetMusicInfo.singer,
      albumName: targetMusicInfo.meta.albumName,
      interval: targetMusicInfo.interval ?? '',
      source: targetMusicInfo.source,
    }),
    normalizeMusicInfo: oldMusicInfo => toNewMusicInfo(oldMusicInfo) as LX.Music.MusicInfoOnline,
    canUse: candidate => candidate.source != 'wy' &&
      !!musicSdk[candidate.source]?.getMusicUrl,
    getResource: async candidate => getMusicUrl({
      musicInfo: candidate,
      isRefresh,
      allowToggleSource: false,
      signal,
    }),
  })
  if (!result) throw new Error(global.i18n.t('toggle_source_failed'))
  targetMusicInfo.meta.toggleMusicInfo = result.musicInfo
  if (!diffCurrentMusicInfo(musicInfo)) setStatusText(global.i18n.t('toggle_source_try'))
  return result.resource
}

const getNormalSourceResource = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, isRefresh: boolean, signal?: AbortSignal) => {
  const toggleMusicInfo = getTargetMusicInfo(musicInfo).meta.toggleMusicInfo
  if (toggleMusicInfo) {
    try {
      return await getMusicUrl({
        musicInfo: toggleMusicInfo,
        isRefresh,
        allowToggleSource: false,
        signal,
      })
    } catch {}
  }
  return getMusicUrl({
    musicInfo,
    isRefresh,
    signal,
    onToggleSource() {
      if (diffCurrentMusicInfo(musicInfo)) return
      setStatusText(global.i18n.t('toggle_source_try'))
    },
  })
}

const getMusicPlayUrl = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, isRefresh = false, isRetryed = false, signal?: AbortSignal): Promise<PlayerResourceInput | null> => {
  // this.musicInfo.url = await getMusicPlayUrl(targetSong, type)
  setStatusText(global.i18n.t('player__getting_url'))
  addLoadTimeout()

  // const type = getPlayType(settingState.setting['player.isPlayHighQuality'], musicInfo)
  const targetMusicInfo = getTargetMusicInfo(musicInfo)
  const resourcePromise = shouldUseProjectSourceOnly(targetMusicInfo)
    ? getProjectSourceResource(musicInfo, isRefresh, signal)
    : getNormalSourceResource(musicInfo, isRefresh, signal)

  return resourcePromise.then(url => {
    if (signal?.aborted === true || global.lx.isPlayedStop || diffCurrentMusicInfo(musicInfo)) return null

    return url
  }).catch(async err => {
    // console.log('err', err.message)
    if (signal?.aborted === true || global.lx.isPlayedStop ||
      diffCurrentMusicInfo(musicInfo) ||
      err.message == requestMsg.cancelRequest) return null

    if (err.message == requestMsg.tooManyRequests) return delayRetry(musicInfo, isRefresh)

    if (!isRetryed) return getMusicPlayUrl(musicInfo, isRefresh, true, signal)

    throw err
  })
}

export const setMusicUrl = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, options?: boolean | SetMusicUrlOptions) => {
  // addLoadTimeout()
  if (!diffCurrentMusicInfo(musicInfo)) return
  const normalizedOptions = normalizeSetMusicUrlOptions(options)
  if (cancelDelayRetry) cancelDelayRetry()
  global.lx.gettingUrlId = createGettingUrlId(musicInfo)
  const signal = playbackCoordinator.begin('play')
  return getMusicPlayUrl(musicInfo, normalizedOptions.isRefresh, false, signal).then((url) => {
    if (!url || signal.aborted) return
    const resource = { ...(typeof url == 'string' ? { url } : url), signal, sessionId: getCurrentListeningSessionId() }
    setMusicInfo({ quality: resource.quality ?? null, qualityVerified: false })
    setResource(musicInfo, resource, {
      startTime: normalizedOptions.startTime,
    })
  }).catch((err: any) => {
    if (signal.aborted) return
    console.log(err)
    setStatusText(err.message as string)
    global.app_event.error()
    addDelayNextTimeout()
  }).finally(() => {
    if (shouldClearGettingUrlId(musicInfo, playerState.playMusicInfo.musicInfo)) {
      global.lx.gettingUrlId = ''
      clearLoadTimeout()
    }
  })
}

// 恢复上次播放的状态
const handleRestorePlay = async(restorePlayInfo: LX.Player.SavedPlayInfo) => {
  const musicInfo = playerState.playMusicInfo.musicInfo
  if (!musicInfo) return

  setTimeout(() => {
    global.app_event.setProgress(settingState.setting['player.isSavePlayTime'] ? restorePlayInfo.time : 0, restorePlayInfo.maxTime)
  })

  const playMusicInfo = playerState.playMusicInfo

  void getPicPath({ musicInfo, listId: playMusicInfo.listId }).then((url: string) => {
    if (
      !isSameMusicIdentity(musicInfo, playMusicInfo.musicInfo) ||
      playerState.musicInfo.pic == url ||
      playerState.loadErrorPicUrl == url
    ) return
    setMusicInfo({ pic: url })
    global.app_event.picUpdated()
  })

  void getLyricInfo({ musicInfo }).then((lyricInfo) => {
    if (!isSameMusicIdentity(musicInfo, playMusicInfo.musicInfo)) return
    setMusicInfo({
      lrc: lyricInfo.lyric,
      tlrc: lyricInfo.tlyric,
      lxlrc: lyricInfo.lxlyric,
      rlrc: lyricInfo.rlyric,
      rawlrc: lyricInfo.rawlrcInfo.lyric,
    })
    global.app_event.lyricUpdated()
  }).catch((err) => {
    console.log(err)
    if (!isSameMusicIdentity(musicInfo, playMusicInfo.musicInfo)) return
    setStatusText(global.i18n.t('lyric__load_error'))
  })

  if (settingState.setting['player.togglePlayMethod'] == 'random' && !playMusicInfo.isTempPlay) addPlayedList(playMusicInfo as LX.Player.PlayMusicInfo)
}


const loadMusicMeta = (musicInfo: LX.Player.PlayMusic, listId: string | null) => {
  void getPicPath({ musicInfo, listId }).then((url: string) => {
    if (
      !isSameMusicIdentity(musicInfo, playerState.playMusicInfo.musicInfo) ||
      playerState.musicInfo.pic == url ||
      playerState.loadErrorPicUrl == url) return
    setMusicInfo({ pic: url })
    global.app_event.picUpdated()
  })

  void getLyricInfo({ musicInfo }).then((lyricInfo) => {
    if (!isSameMusicIdentity(musicInfo, playerState.playMusicInfo.musicInfo)) return
    setMusicInfo({
      lrc: lyricInfo.lyric,
      tlrc: lyricInfo.tlyric,
      lxlrc: lyricInfo.lxlyric,
      rlrc: lyricInfo.rlyric,
      rawlrc: lyricInfo.rawlrcInfo.lyric,
    })
    global.app_event.lyricUpdated()
  }).catch((err) => {
    console.log(err)
    if (!isSameMusicIdentity(musicInfo, playerState.playMusicInfo.musicInfo)) return
    setStatusText(global.i18n.t('lyric__load_error'))
  })
}

const debouncePlay = debounceBackgroundTimer((musicInfo: LX.Player.PlayMusic, listId: string | null, options?: boolean | SetMusicUrlOptions) => {
  void setMusicUrl(musicInfo, options)
  loadMusicMeta(musicInfo, listId)
}, 200)

// 处理音乐播放
const handlePlay = async(options?: boolean | SetMusicUrlOptions) => {
  if (!isInitialized()) {
    await checkNotificationPermission()
    void checkIgnoringBatteryOptimization()
    await playerInitial({
      volume: settingState.setting['player.volume'],
      playRate: settingState.setting['player.playbackRate'],
      cacheSize: settingState.setting['player.cacheSize'] ? parseInt(settingState.setting['player.cacheSize']) : 0,
      isHandleAudioFocus: settingState.setting['player.isHandleAudioFocus'],
      isEnableAudioOffload: settingState.setting['player.isEnableAudioOffload'],
    })
  }

  global.lx.isPlayedStop &&= false
  resetRandomNextMusicInfo()

  if (global.lx.restorePlayInfo) {
    void handleRestorePlay(global.lx.restorePlayInfo)
    global.lx.restorePlayInfo = null
    return
  }

  const playMusicInfo = playerState.playMusicInfo
  const musicInfo = playMusicInfo.musicInfo

  if (!musicInfo) return
  if (playMusicInfo.listId != LIST_IDS.TEMP || listState.tempListMeta.id != PRIVATE_FM_TEMP_LIST_ID) exitPrivateFmMode()

  await setStop()
  global.app_event.pause()

  clearDelayNextTimeout()
  clearLoadTimeout()


  if (settingState.setting['player.togglePlayMethod'] == 'random' && !playMusicInfo.isTempPlay) addPlayedList(playMusicInfo as LX.Player.PlayMusicInfo)

  debouncePlay(musicInfo, playMusicInfo.listId, options)
}

/**
 * 播放列表内歌曲
 * @param listId 列表id
 * @param id 歌曲id
 */
export const playListById = async(listId: string, id: string) => {
  const prevListId = playerState.playInfo.playerListId
  setPlayListId(listId)
  const musicInfo = getList(listId).find(m => m.id == id)
  if (!musicInfo) return
  setPlayMusicInfo(listId, musicInfo)
  if (settingState.setting['player.isAutoCleanPlayedList'] || prevListId != listId) clearPlayedList()
  clearTempPlayeList()
  await handlePlay()
}

/**
 * 播放列表内歌曲
 * @param listId 列表id
 * @param index 播放的歌曲位置
 */
export const playList = async(listId: string, index: number) => {
  const prevListId = playerState.playInfo.playerListId
  setPlayListId(listId)
  setPlayMusicInfo(listId, getList(listId)[index])
  if (settingState.setting['player.isAutoCleanPlayedList'] || prevListId != listId) clearPlayedList()
  clearTempPlayeList()
  await handlePlay()
}

export const playMusicInfo = async(musicInfo: LX.Player.PlayMusic, options?: PlayMusicOptions) => {
  const normalizedOptions = normalizePlayMusicOptions(options)
  if (normalizedOptions.listId != null || !normalizedOptions.isTempPlay) {
    setPlayListId(normalizedOptions.listId)
  }
  setPlayMusicInfo(normalizedOptions.listId, musicInfo, normalizedOptions.isTempPlay)
  if (normalizedOptions.clearTempList) clearTempPlayeList()
  await handlePlay({
    isRefresh: normalizedOptions.isRefresh,
    startTime: normalizedOptions.startTime,
  })
}

const handleToggleStop = async() => {
  await stop()
  setTimeout(() => {
    setPlayMusicInfo(null, null)
  })
}


const randomNextMusicInfo = {
  info: null as LX.Player.PlayMusicInfo | null,
  // index: -1,
}
export const peekRandomNextMusicInfo = () => randomNextMusicInfo.info
export const resetRandomNextMusicInfo = () => {
  if (randomNextMusicInfo.info) {
    randomNextMusicInfo.info = null
    global.state_event.playQueueUpdated()
    // randomNextMusicInfo.index = -1
  }
}

const getPrivateFmNextPlayMusicInfo = async(): Promise<LX.Player.PlayMusicInfo | null | undefined> => {
  if (!privateFmState.isPrivateFmActive ||
    playerState.playInfo.playerListId != LIST_IDS.TEMP ||
    listState.tempListMeta.id != PRIVATE_FM_TEMP_LIST_ID) return undefined

  const currentMusicInfo = playerState.playMusicInfo.musicInfo
  if (!currentMusicInfo) return null
  await ensurePrivateFmNextSongs(getTargetMusicInfo(currentMusicInfo))
  const currentList = getList(LIST_IDS.TEMP)
  const currentIdentity = createPlayerMusicIdentity(currentMusicInfo)
  const currentIndex = currentList.findIndex(item => createPlayerMusicIdentity(item) == currentIdentity)
  const nextMusicInfo = currentList[currentIndex + 1]
  return nextMusicInfo
    ? { musicInfo: nextMusicInfo, listId: LIST_IDS.TEMP, isTempPlay: false }
    : null
}

export const getNextPlayMusicInfo = async(): Promise<LX.Player.PlayMusicInfo | null> => {
  const partyQueuePlayMusicInfo = getPartyQueuePlayMusicInfo(1)
  if (partyQueuePlayMusicInfo) return partyQueuePlayMusicInfo

  if (playerState.tempPlayList.length) { // 如果稍后播放列表存在歌曲则直接播放改列表的歌曲
    const playMusicInfo = playerState.tempPlayList[0]
    return playMusicInfo
  }

  if (playerState.playMusicInfo.musicInfo == null) return null

  const privateFmNextPlayMusicInfo = await getPrivateFmNextPlayMusicInfo()
  if (privateFmNextPlayMusicInfo !== undefined) return privateFmNextPlayMusicInfo

  if (randomNextMusicInfo.info) return randomNextMusicInfo.info

  const playMusicInfo = playerState.playMusicInfo
  const playInfo = playerState.playInfo
  // console.log(playInfo.playerListId)
  const currentListId = playInfo.playerListId
  if (!currentListId) return null
  const currentList = getList(currentListId)

  const playedList = playerState.playedList
  if (playedList.length) { // 移除已播放列表内不存在原列表的歌曲
    let currentId: string
    if (playMusicInfo.isTempPlay) {
      const musicInfo = currentList[playInfo.playerPlayIndex]
      if (musicInfo) currentId = musicInfo.id
    } else {
      currentId = playMusicInfo.musicInfo!.id
    }
    // 从已播放列表移除播放列表已删除的歌曲
    let index
    for (index = playedList.findIndex(m => m.musicInfo.id === currentId) + 1; index < playedList.length; index++) {
      const playMusicInfo = playedList[index]
      const currentId = playMusicInfo.musicInfo.id
      if (playMusicInfo.listId == currentListId && !currentList.some(m => m.id === currentId)) {
        removePlayedList(index)
        continue
      }
      break
    }

    if (index < playedList.length) return playedList[index]
  }
  // const isCheckFile = findNum > 2 // 针对下载列表，如果超过两次都碰到无效歌曲，则过滤整个列表内的无效歌曲
  let { filteredList, playerIndex } = await filterList({ // 过滤已播放歌曲
    listId: currentListId,
    list: currentList,
    playedList,
    playerMusicInfo: currentList[playInfo.playerPlayIndex],
    isNext: true,
  })

  if (!filteredList.length) return null
  // let currentIndex: number = filteredList.indexOf(currentList[playInfo.playerPlayIndex])
  if (playerIndex == -1 && filteredList.length) playerIndex = 0
  let nextIndex = playerIndex

  let togglePlayMethod = settingState.setting['player.togglePlayMethod']
  switch (togglePlayMethod) {
    case 'listLoop':
      nextIndex = playerIndex === filteredList.length - 1 ? 0 : playerIndex + 1
      break
    case 'random':
      nextIndex = getRandom(0, filteredList.length)
      break
    case 'list':
      nextIndex = playerIndex === filteredList.length - 1 ? -1 : playerIndex + 1
      break
    case 'singleLoop':
      break
    default:
      return null
  }
  if (nextIndex < 0) return null

  const nextPlayMusicInfo = {
    musicInfo: filteredList[nextIndex],
    listId: currentListId,
    isTempPlay: false,
  }

  if (togglePlayMethod == 'random') {
    randomNextMusicInfo.info = nextPlayMusicInfo
    global.state_event.playQueueUpdated()
    // randomNextMusicInfo.index = nextIndex
  }
  return nextPlayMusicInfo
}

const handlePlayNext = async(playMusicInfo: LX.Player.PlayMusicInfo) => {
  setPlayMusicInfo(playMusicInfo.listId, playMusicInfo.musicInfo, playMusicInfo.isTempPlay)
  await handlePlay()
  void ensurePrivateFmNextSongs(getTargetMusicInfo(playMusicInfo.musicInfo)).catch(err => { console.log(err) })
}
export const playQueuedMusicInfo = handlePlayNext
/**
 * 下一曲
 * @param isAutoToggle 是否自动切换
 * @returns
 */
export const playNext = async(isAutoToggle = false): Promise<void> => {
  const partyQueuePlayMusicInfo = getPartyQueuePlayMusicInfo(1)
  if (partyQueuePlayMusicInfo) {
    await handlePlayNext(partyQueuePlayMusicInfo)
    return
  }

  if (playerState.tempPlayList.length) { // 如果稍后播放列表存在歌曲则直接播放改列表的歌曲
    const playMusicInfo = playerState.tempPlayList[0]
    removeTempPlayList(0)
    await handlePlayNext(playMusicInfo)
    return
  }

  const playMusicInfo = playerState.playMusicInfo
  const playInfo = playerState.playInfo
  if (playMusicInfo.musicInfo == null) return handleToggleStop()

  const privateFmNextPlayMusicInfo = await getPrivateFmNextPlayMusicInfo()
  if (privateFmNextPlayMusicInfo !== undefined) {
    if (privateFmNextPlayMusicInfo) await handlePlayNext(privateFmNextPlayMusicInfo)
    else await handleToggleStop()
    return
  }

  // console.log(playInfo.playerListId)
  const currentListId = playInfo.playerListId
  if (!currentListId) return handleToggleStop()
  const currentList = getList(currentListId)

  const playedList = playerState.playedList

  if (playedList.length) { // 移除已播放列表内不存在原列表的歌曲
    let currentId: string
    if (playMusicInfo.isTempPlay) {
      const musicInfo = currentList[playInfo.playerPlayIndex]
      if (musicInfo) currentId = musicInfo.id
    } else {
      currentId = playMusicInfo.musicInfo.id
    }
    // 从已播放列表移除播放列表已删除的歌曲
    let index
    for (index = playedList.findIndex(m => m.musicInfo.id === currentId) + 1; index < playedList.length; index++) {
      const playMusicInfo = playedList[index]
      const currentId = playMusicInfo.musicInfo.id
      if (playMusicInfo.listId == currentListId && !currentList.some(m => m.id === currentId)) {
        removePlayedList(index)
        continue
      }
      break
    }

    if (index < playedList.length) {
      await handlePlayNext(playedList[index])
      return
    }
  }
  if (randomNextMusicInfo.info) {
    await handlePlayNext(randomNextMusicInfo.info)
    return
  }
  // const isCheckFile = findNum > 2 // 针对下载列表，如果超过两次都碰到无效歌曲，则过滤整个列表内的无效歌曲
  let { filteredList, playerIndex } = await filterList({ // 过滤已播放歌曲
    listId: currentListId,
    list: currentList,
    playedList,
    playerMusicInfo: currentList[playInfo.playerPlayIndex],
    isNext: true,
  })

  if (!filteredList.length) return handleToggleStop()
  // let currentIndex: number = filteredList.indexOf(currentList[playInfo.playerPlayIndex])
  if (playerIndex == -1 && filteredList.length) playerIndex = 0
  let nextIndex = playerIndex

  let togglePlayMethod = settingState.setting['player.togglePlayMethod']
  if (!isAutoToggle) {
    switch (togglePlayMethod) {
      case 'list':
      case 'singleLoop':
      case 'none':
        togglePlayMethod = 'listLoop'
    }
  }
  switch (togglePlayMethod) {
    case 'listLoop':
      nextIndex = playerIndex === filteredList.length - 1 ? 0 : playerIndex + 1
      break
    case 'random':
      nextIndex = getRandom(0, filteredList.length)
      break
    case 'list':
      nextIndex = playerIndex === filteredList.length - 1 ? -1 : playerIndex + 1
      break
    case 'singleLoop':
      break
    default:
      nextIndex = -1
      return
  }
  if (nextIndex < 0) return

  await handlePlayNext({
    musicInfo: filteredList[nextIndex],
    listId: currentListId,
    isTempPlay: false,
  })
}

/**
 * 上一曲
 */
export const playPrev = async(isAutoToggle = false): Promise<void> => {
  const partyQueuePlayMusicInfo = getPartyQueuePlayMusicInfo(-1)
  if (partyQueuePlayMusicInfo) {
    await handlePlayNext(partyQueuePlayMusicInfo)
    return
  }

  const playMusicInfo = playerState.playMusicInfo
  if (playMusicInfo.musicInfo == null) return handleToggleStop()
  const playInfo = playerState.playInfo

  const currentListId = playInfo.playerListId
  if (!currentListId) return handleToggleStop()
  const currentList = getList(currentListId)

  const playedList = playerState.playedList
  if (playedList.length) {
    let currentId: string
    if (playMusicInfo.isTempPlay) {
      const musicInfo = currentList[playInfo.playerPlayIndex]
      if (musicInfo) currentId = musicInfo.id
    } else {
      currentId = playMusicInfo.musicInfo.id
    }
    // 从已播放列表移除播放列表已删除的歌曲
    let index
    for (index = playedList.findIndex(m => m.musicInfo.id === currentId) - 1; index > -1; index--) {
      const playMusicInfo = playedList[index]
      const currentId = playMusicInfo.musicInfo.id
      if (playMusicInfo.listId == currentListId && !currentList.some(m => m.id === currentId)) {
        removePlayedList(index)
        continue
      }
      break
    }

    if (index > -1) {
      await handlePlayNext(playedList[index])
      return
    }
  }

  // const isCheckFile = findNum > 2
  let { filteredList, playerIndex } = await filterList({ // 过滤已播放歌曲
    listId: currentListId,
    list: currentList,
    playedList,
    playerMusicInfo: currentList[playInfo.playerPlayIndex],
    isNext: false,
  })
  if (!filteredList.length) return handleToggleStop()

  // let currentIndex = filteredList.indexOf(currentList[playInfo.playerPlayIndex])
  if (playerIndex == -1 && filteredList.length) playerIndex = 0
  let nextIndex = playerIndex
  if (!playMusicInfo.isTempPlay) {
    let togglePlayMethod = settingState.setting['player.togglePlayMethod']
    if (!isAutoToggle) {
      switch (togglePlayMethod) {
        case 'list':
        case 'singleLoop':
        case 'none':
          togglePlayMethod = 'listLoop'
      }
    }
    switch (togglePlayMethod) {
      case 'random':
        nextIndex = getRandom(0, filteredList.length)
        break
      case 'listLoop':
      case 'list':
        nextIndex = playerIndex === 0 ? filteredList.length - 1 : playerIndex - 1
        break
      case 'singleLoop':
        break
      default:
        nextIndex = -1
        return
    }
    if (nextIndex < 0) return
  }


  await handlePlayNext({
    musicInfo: filteredList[nextIndex],
    listId: currentListId,
    isTempPlay: false,
  })
}

/**
 * 恢复播放
 */
export const play = () => {
  if (playerState.playMusicInfo.musicInfo == null) return
  if (isEmpty()) {
    if (createGettingUrlId(playerState.playMusicInfo.musicInfo) != global.lx.gettingUrlId) void setMusicUrl(playerState.playMusicInfo.musicInfo)
    return
  }
  void setPlay()
}

/**
 * 暂停播放
 */
export const pause = async() => {
  await setPause()
}

/**
 * 停止播放
 */
export const stop = async() => {
  await setStop()
  setTimeout(() => {
    global.app_event.stop()
  })
}

/**
 * 播放、暂停播放切换
 */
export const togglePlay = () => {
  global.lx.isPlayedStop &&= false
  if (playerState.isPlay) {
    void pause()
  } else {
    play()
  }
}

/**
 * 收藏当前播放的歌曲
 */
export const collectMusic = () => {
  if (!playerState.playMusicInfo.musicInfo) return
  void addListMusics(LIST_IDS.LOVE, [
    'progress' in playerState.playMusicInfo.musicInfo
      ? playerState.playMusicInfo.musicInfo.metadata.musicInfo
      : playerState.playMusicInfo.musicInfo,
  ], settingState.setting['list.addMusicLocationType'])
}

/**
 * 取消收藏当前播放的歌曲
 */
export const uncollectMusic = () => {
  if (!playerState.playMusicInfo.musicInfo) return
  void removeListMusics(LIST_IDS.LOVE, [
    'progress' in playerState.playMusicInfo.musicInfo
      ? playerState.playMusicInfo.musicInfo.metadata.musicInfo.id
      : playerState.playMusicInfo.musicInfo.id,
  ])
}

/**
 * 不喜欢当前播放的歌曲
 */
export const dislikeMusic = async() => {
  if (!playerState.playMusicInfo.musicInfo) return
  const minfo = 'progress' in playerState.playMusicInfo.musicInfo ? playerState.playMusicInfo.musicInfo.metadata.musicInfo : playerState.playMusicInfo.musicInfo
  await addDislikeInfo([{ name: minfo.name, singer: minfo.singer }])
  await playNext(true)
}

