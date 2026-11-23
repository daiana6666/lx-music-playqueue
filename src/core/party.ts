import BackgroundTimer from 'react-native-background-timer'
import { getLoadedMusicIdentity, setPlaybackRate as setTrackPlaybackRate } from '@/plugins/player'
import { setPlaybackRate as setLyricPlaybackRate } from '@/core/lyric'
import { getClient } from '@/plugins/sync'
import log from '@/plugins/sync/log'
import { play, pause, playMusicInfo } from '@/core/player/player'
import partyActions from '@/store/party/action'
import partyState from '@/store/party/state'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { clipboardWriteText, debounceBackgroundTimer, toast } from '@/utils/tools'

const PARTY_PING_INTERVAL = 20_000
const LOCAL_SYNC_GUARD_MS = 1_500
const LOCAL_MUSIC_SWITCH_PLAY_INTENT_MS = 15_000
const SEEK_DIFF_MAX_S = 1.2
const PARTY_EXIT_TIMEOUT_MS = 1_500

const errorMessageMap: Record<string, string> = {
  'room not found': '\u623F\u95F4\u4E0D\u5B58\u5728',
  'invalid room password': '\u623F\u95F4\u5BC6\u7801\u9519\u8BEF',
  'room is full': '\u623F\u95F4\u5DF2\u6EE1',
  'member is not in any room': '\u4F60\u5F53\u524D\u4E0D\u5728\u4EFB\u4F55\u623F\u95F4\u5185',
  'only host can do this operation': '\u4EC5\u623F\u4E3B\u53EF\u6267\u884C\u6B64\u64CD\u4F5C',
  'target member not found': '\u76EE\u6807\u6210\u5458\u4E0D\u5B58\u5728',
  'host can not remove itself': '\u623F\u4E3B\u4E0D\u80FD\u79FB\u9664\u81EA\u5DF1',
  'currentIndex out of range': '\u5F53\u524D\u64AD\u653E\u7D22\u5F15\u8D85\u51FA\u8303\u56F4',
  'queue item not found': '\u64AD\u653E\u961F\u5217\u9879\u4E0D\u5B58\u5728',
  'maxMembers can not be smaller than current member count': '\u6700\u5927\u6210\u5458\u6570\u4E0D\u80FD\u5C0F\u4E8E\u5F53\u524D\u6210\u5458\u6570',
  'roomCode must be 4-12 chars of A-Z or 0-9': '\u623F\u95F4\u53F7\u9700\u4E3A 4 \u5230 12 \u4F4D\u5927\u5199\u5B57\u6BCD\u6216\u6570\u5B57',
  'roomCode already exists': '\u8BE5\u623F\u95F4\u53F7\u5DF2\u88AB\u4F7F\u7528',
  'Sync service is not connected': '\u540C\u6B65\u670D\u52A1\u672A\u8FDE\u63A5',
}

let heartbeatTimer: number | null = null
let isPartyModuleReady = false
let localSyncGuardUntil = 0
let localMusicSwitchPlayUntil = 0
let localMusicSwitchIdentity = ''
let lastAppliedPlaybackKey = ''
let isPlaybackListenersRegistered = false
let ensureRoomPromise: Promise<LX.Party.RoomSnapshot | null> | null = null
let shutdownRoomPromise: Promise<void> | null = null

const getRemote = () => {
  const client = getClient()
  if (!client?.isReady || !client.moduleReadys.party) return null
  return client.remoteQueueParty
}

const withTimeout = async<T>(promise: Promise<T>, timeoutMs: number) => {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('party request timeout'))
    }, timeoutMs)
    void promise.then(result => {
      clearTimeout(timer)
      resolve(result)
    }).catch(error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

const normalizeMusicInfo = (
  musicInfo: LX.Player.PlayMusicInfo['musicInfo'] | LX.Party.PlaybackState['currentMusic'],
): LX.Music.MusicInfo | null => {
  if (!musicInfo) return null
  return 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
}

const createMusicIdentity = (
  musicInfo: LX.Player.PlayMusicInfo['musicInfo'] | LX.Party.PlaybackState['currentMusic'],
) => {
  const targetMusicInfo = normalizeMusicInfo(musicInfo)
  return targetMusicInfo ? `${targetMusicInfo.source}:${targetMusicInfo.id}` : ''
}

const getQueueCurrentIndex = (
  room: LX.Party.RoomSnapshot | null,
  musicInfo: LX.Player.PlayMusicInfo['musicInfo'] | LX.Party.PlaybackState['currentMusic'],
) => {
  const identity = createMusicIdentity(musicInfo)
  if (!room || !identity || !room.playback.queue.length) return -1
  if (createMusicIdentity(room.playback.queue[room.playback.currentIndex]?.musicInfo) == identity) return room.playback.currentIndex
  return room.playback.queue.findIndex(item => createMusicIdentity(item.musicInfo) === identity)
}

const getRemoteProgress = (playback: LX.Party.PlaybackState) => {
  if (!playback.playing) return playback.progress
  return playback.progress + Math.max(0, Date.now() - playback.progressAt) * playback.rate
}

const guardLocalSync = () => {
  localSyncGuardUntil = Date.now() + LOCAL_SYNC_GUARD_MS
}

const markLocalMusicSwitchPlayIntent = () => {
  if (Date.now() < localSyncGuardUntil) return
  localMusicSwitchIdentity = createMusicIdentity(playerState.playMusicInfo.musicInfo)
  localMusicSwitchPlayUntil = Date.now() + LOCAL_MUSIC_SWITCH_PLAY_INTENT_MS
}

const clearLocalMusicSwitchPlayIntent = () => {
  localMusicSwitchPlayUntil = 0
  localMusicSwitchIdentity = ''
}

const hasLocalMusicSwitchPlayIntent = () => {
  return Date.now() < localMusicSwitchPlayUntil &&
    !!localMusicSwitchIdentity &&
    localMusicSwitchIdentity === createMusicIdentity(playerState.playMusicInfo.musicInfo)
}

const isSameMusic = (
  left: LX.Player.PlayMusicInfo['musicInfo'] | LX.Music.MusicInfo | null,
  right: LX.Music.MusicInfo | null,
) => {
  const current = normalizeMusicInfo(left)
  if (!current || !right) return current == right
  return current.id === right.id && current.source === right.source
}

const updateRoom = (room: LX.Party.RoomSnapshot | null) => {
  if (!room) lastAppliedPlaybackKey = ''
  partyActions.setRoom(room)
  updateHeartbeat()
}

const updateHeartbeat = () => {
  const shouldRun = !!partyState.room && isPartyModuleReady
  if (!shouldRun) {
    if (heartbeatTimer != null) {
      BackgroundTimer.clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    return
  }
  if (heartbeatTimer != null) return
  heartbeatTimer = BackgroundTimer.setInterval(() => {
    void pingPartyRoom()
  }, PARTY_PING_INTERVAL)
}

const syncPartyPlaybackNow = async(force = false) => {
  if (Date.now() < localSyncGuardUntil) return

  const room = partyState.room
  const remote = getRemote()
  if (!room || !remote) return
  if (!force && !canControlPartyPlayback(room)) return

  try {
    const nextRoom = await remote.party_playback_update(buildPlaybackPayload())
    updateRoom(nextRoom)
  } catch (error) {
    log.r_error('party_playback_update failed:', error)
  }
}

const trySeedRoomPlayback = (room: LX.Party.RoomSnapshot | null) => {
  if (!room) return
  if (room.playback.currentMusic) return
  if (!normalizeMusicInfo(playerState.playMusicInfo.musicInfo)) return
  if (!canControlPartyPlayback(room)) return
  void syncPartyPlaybackNow(true)
}

const registerPlaybackListeners = () => {
  if (isPlaybackListenersRegistered) return
  isPlaybackListenersRegistered = true

  const syncPlayback = () => {
    syncPartyPlayback()
  }
  const handleMusicToggled = () => {
    markLocalMusicSwitchPlayIntent()
    syncPartyPlayback()
  }
  const handlePlay = () => {
    clearLocalMusicSwitchPlayIntent()
    syncPartyPlayback()
  }
  const handlePlayMusicInfoChanged: typeof global.state_event.playMusicInfoChanged = () => {
    syncPartyPlayback()
  }
  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys) => {
    if (!keys.includes('player.playbackRate')) return
    syncPartyPlayback()
  }

  global.app_event.on('musicToggled', handleMusicToggled)
  global.app_event.on('play', handlePlay)
  global.app_event.on('pause', syncPlayback)
  global.app_event.on('stop', syncPlayback)
  global.app_event.on('setProgress', syncPlayback)
  global.state_event.on('playMusicInfoChanged', handlePlayMusicInfoChanged)
  global.state_event.on('configUpdated', handleConfigUpdated)
}

const applyRemotePlayback = async(room: LX.Party.RoomSnapshot | null) => {
  if (!room?.playback.currentMusic) return

  const clientId = getClient()?.data.keyInfo.clientId
  if (clientId && room.playback.operator?.clientId === clientId) return

  const playbackKey = `${room.roomId}:${room.playback.version}`
  if (lastAppliedPlaybackKey === playbackKey) return
  lastAppliedPlaybackKey = playbackKey

  const remoteMusic = room.playback.currentMusic
  const remoteProgress = getRemoteProgress(room.playback) / 1000
  const remoteDuration = room.playback.duration == null ? undefined : room.playback.duration / 1000
  const remoteMusicIdentity = createMusicIdentity(remoteMusic)
  const shouldReplaceMusic =
    !isSameMusic(playerState.playMusicInfo.musicInfo, remoteMusic) ||
    getLoadedMusicIdentity() !== remoteMusicIdentity
  const shouldSeek =
    shouldReplaceMusic ||
    !playerState.isPlay ||
    !room.playback.playing ||
    Math.abs(playerState.progress.nowPlayTime - remoteProgress) > SEEK_DIFF_MAX_S

  guardLocalSync()

  if (shouldReplaceMusic) {
    await playMusicInfo(remoteMusic, {
      listId: null,
      isTempPlay: true,
      clearTempList: true,
      startTime: remoteProgress,
    })
  }

  void setTrackPlaybackRate(room.playback.rate).catch(() => {})
  void setLyricPlaybackRate(room.playback.rate).catch(() => {})

  if (shouldSeek) {
    global.app_event.setProgress(remoteProgress, remoteDuration)
  }

  if (!shouldReplaceMusic) {
    if (room.playback.playing) play()
    else if (playerState.isPlay) void pause()
  }
}

const buildPlaybackPayload = () => {
  const musicInfo = normalizeMusicInfo(playerState.playMusicInfo.musicInfo)
  const currentIndex = getQueueCurrentIndex(partyState.room, playerState.playMusicInfo.musicInfo)
  return {
    currentMusic: musicInfo,
    currentIndex,
    playing: musicInfo ? playerState.isPlay || hasLocalMusicSwitchPlayIntent() : false,
    progress: Math.round(playerState.progress.nowPlayTime * 1000),
    progressAt: Date.now(),
    duration: playerState.progress.maxPlayTime ? Math.round(playerState.progress.maxPlayTime * 1000) : null,
    rate: settingState.setting['player.playbackRate'],
  }
}

export const getPartyErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return errorMessageMap[message] ?? message
}

export const getPartyRoom = () => partyState.room

export const getPartySelfMember = (room = partyState.room) => {
  const clientId = getClient()?.data.keyInfo.clientId
  if (!room || !clientId) return null
  return room.members.find(member => member.clientId === clientId) ?? null
}

export const canControlPartyPlayback = (room = partyState.room) => {
  if (!room) return false
  if (room.settings.controlMode === 'all') return true
  return getPartySelfMember(room)?.isHost === true
}

export const setPartyModuleReady = (ready: boolean) => {
  isPartyModuleReady = ready
  updateHeartbeat()
  if (ready) {
    registerPlaybackListeners()
    void ensurePartyRoomLoaded()
  }
}

export const handlePartyRoomSnapshot = (room: LX.Party.RoomSnapshot | null, shouldApplyPlayback = true) => {
  updateRoom(room)
  trySeedRoomPlayback(room)
  if (shouldApplyPlayback) void applyRemotePlayback(room)
}

export const ensurePartyRoomLoaded = async() => {
  if (ensureRoomPromise) return ensureRoomPromise
  const remote = getRemote()
  if (!remote) return null
  ensureRoomPromise = remote.party_room_get_current()
    .then(room => {
      handlePartyRoomSnapshot(room)
      return room
    })
    .finally(() => {
      ensureRoomPromise = null
    })
  return ensureRoomPromise
}

export const createPartyRoom = async(input: {
  name?: string
  roomCode?: string
  password?: string
  displayName?: string
}) => {
  const remote = getRemote()
  if (!remote) throw new Error('Sync service is not connected')
  const room = await remote.party_room_create({
    ...input,
    controlMode: 'all',
    maxMembers: 8,
  })
  handlePartyRoomSnapshot(room, false)
  await syncPartyPlaybackNow(true)
  return room
}

export const joinPartyRoom = async(input: {
  roomCode: string
  password?: string
  displayName?: string
}) => {
  const remote = getRemote()
  if (!remote) throw new Error('Sync service is not connected')
  const room = await remote.party_room_join(input)
  handlePartyRoomSnapshot(room)
  return room
}

export const leavePartyRoom = async() => {
  const remote = getRemote()
  if (!remote) throw new Error('Sync service is not connected')
  await remote.party_room_leave()
  updateRoom(null)
}

export const getPartyQueue = (room = partyState.room) => room?.playback.queue ?? []

export const playPartyQueueItem = async(roomId: string, entryId: string) => {
  const room = partyState.room
  const remote = getRemote()
  if (!room || room.roomId != roomId || !remote) throw new Error(global.i18n.t('phase1_queue_changed'))
  if (!canControlPartyPlayback(room)) throw new Error(global.i18n.t('phase1_queue_no_control'))
  const currentIndex = room.playback.queue.findIndex(entry => entry.id == entryId)
  if (currentIndex < 0) throw new Error(global.i18n.t('phase1_queue_changed'))
  const updated = await remote.party_playback_update({
    currentMusic: room.playback.queue[currentIndex].musicInfo,
    currentIndex,
    playing: true,
    progress: 0,
    progressAt: Date.now(),
    duration: null,
    rate: settingState.setting['player.playbackRate'],
  })
  if (partyState.room?.roomId != roomId) return
  updateRoom(updated)
  await applyRemotePlayback(updated)
}

export const appendPartyQueue = async(queue: LX.Party.QueueItemInput[]) => {
  const remote = getRemote()
  if (!remote) throw new Error('Sync service is not connected')
  if (!queue.length) return partyState.room
  const room = await remote.party_queue_append(queue)
  handlePartyRoomSnapshot(room, false)
  return room
}

export const removePartyQueueItems = async(ids: string[]) => {
  const remote = getRemote()
  if (!remote) throw new Error('Sync service is not connected')
  if (!ids.length) return partyState.room
  const room = await remote.party_queue_remove(ids)
  handlePartyRoomSnapshot(room, false)
  return room
}

export const dismissPartyRoom = async() => {
  const remote = getRemote()
  if (!remote) throw new Error('Sync service is not connected')
  await remote.party_room_dismiss()
  updateRoom(null)
}

export const shutdownPartyRoom = async() => {
  if (shutdownRoomPromise) return shutdownRoomPromise
  const room = partyState.room
  const remote = getRemote()
  if (!room || !remote) {
    updateRoom(null)
    return
  }

  const isHost = getPartySelfMember(room)?.isHost === true
  shutdownRoomPromise = withTimeout(
    isHost ? remote.party_room_dismiss() : remote.party_room_leave(),
    PARTY_EXIT_TIMEOUT_MS,
  ).catch(error => {
    log.r_error('party shutdown failed:', error)
  }).finally(() => {
    updateRoom(null)
    shutdownRoomPromise = null
  })

  return shutdownRoomPromise
}

export const pingPartyRoom = async() => {
  const remote = getRemote()
  if (!remote) return null
  const room = await remote.party_ping()
  updateRoom(room)
  return room
}

export const syncPartyPlayback = debounceBackgroundTimer(async(force: boolean = false) => syncPartyPlaybackNow(force), 260)

export const copyPartyRoomCode = () => {
  if (!partyState.room) return
  clipboardWriteText(partyState.room.roomCode)
  toast('\u623F\u95F4\u53F7\u5DF2\u590D\u5236')
}
