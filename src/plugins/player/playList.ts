import TrackPlayer, { State } from 'react-native-track-player'
import BackgroundTimer from 'react-native-background-timer'
import { defaultUrl } from '@/config'
// import { action as playerAction } from '@/store/modules/player'
import settingState from '@/store/setting/state'
import type { PlayerResourceInput } from './utils'


const list: LX.Player.Track[] = []
let loadedMusicIdentity = ''
let loadedPlaybackSessionId: string | undefined
export const getLoadedPlaybackSessionId = () => loadedPlaybackSessionId

const defaultUserAgent = 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36'
const httpRxp = /^(data:image\/|https?:\/\/.+|\/.+)/

const getMusicIdentity = (musicInfo: LX.Player.PlayMusic) => {
  const targetMusicInfo = 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
  return `${targetMusicInfo.source}:${targetMusicInfo.id}`
}

export const state = {
  isPlaying: false,
  prevDuration: -1,
}

const formatMusicInfo = (musicInfo: LX.Player.PlayMusic) => {
  return 'progress' in musicInfo ? {
    id: musicInfo.id,
    pic: musicInfo.metadata.musicInfo.meta.picUrl,
    name: musicInfo.metadata.musicInfo.name,
    singer: musicInfo.metadata.musicInfo.singer,
    album: musicInfo.metadata.musicInfo.meta.albumName,
  } : {
    id: musicInfo.id,
    pic: musicInfo.source == 'webdav' && musicInfo.meta.picUrl?.startsWith('webdav:') ? null : musicInfo.meta.picUrl,
    name: musicInfo.name,
    singer: musicInfo.singer,
    album: musicInfo.meta.albumName,
  }
}

const normalizeResource = (resource: PlayerResourceInput) => typeof resource == 'string'
  ? { url: resource, headers: undefined }
  : resource

const buildTracks = (musicInfo: LX.Player.PlayMusic, resource: PlayerResourceInput, duration?: LX.Player.Track['duration']): LX.Player.Track[] => {
  const mInfo = formatMusicInfo(musicInfo)
  const musicIdentity = getMusicIdentity(musicInfo)
  const track = [] as LX.Player.Track[]
  const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
  const album = mInfo.album || undefined
  const artwork = isShowNotificationImage && mInfo.pic && httpRxp.test(mInfo.pic) ? mInfo.pic : undefined
  const { url, headers } = normalizeResource(resource)
  if (url) {
    track.push({
      id: `${mInfo.id}__//${Math.random()}__//audio`,
      url,
      title: mInfo.name || 'Unknow',
      artist: mInfo.singer || 'Unknow',
      album,
      artwork,
      userAgent: defaultUserAgent,
      headers,
      musicId: musicIdentity,
      // original: { ...musicInfo },
      duration,
    })
  }
  track.push({
    id: `${mInfo.id}__//${Math.random()}__//default`,
    url: defaultUrl,
    title: mInfo.name || 'Unknow',
    artist: mInfo.singer || 'Unknow',
    album,
    artwork,
    musicId: musicIdentity,
    // original: { ...musicInfo },
    duration: 0,
  })
  return track
  // console.log('buildTrack', musicInfo.name, url)
}
// const buildTrack = (musicInfo: LX.Player.PlayMusic, url: LX.Player.Track['url'], duration?: LX.Player.Track['duration']): LX.Player.Track => {
//   const mInfo = formatMusicInfo(musicInfo)
//   const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
//   const album = mInfo.album || undefined
//   const artwork = isShowNotificationImage && mInfo.pic && httpRxp.test(mInfo.pic) ? mInfo.pic : undefined
//   return url
//     ? {
//         id: `${mInfo.id}__//${Math.random()}__//audio`,
//         url,
//         title: mInfo.name || 'Unknow',
//         artist: mInfo.singer || 'Unknow',
//         album,
//         artwork,
//         userAgent: defaultUserAgent,
//         musicId: `${mInfo.id}`,
//         original: { ...musicInfo },
//         duration,
//       }
//     : {
//         id: `${mInfo.id}__//${Math.random()}__//default`,
//         url: defaultUrl,
//         title: mInfo.name || 'Unknow',
//         artist: mInfo.singer || 'Unknow',
//         album,
//         artwork,
//         musicId: `${mInfo.id}`,
//         original: { ...musicInfo },
//         duration: 0,
//       }
// }

export const isTempTrack = (trackId: string) => /\/\/default$/.test(trackId)


export const getCurrentTrackId = async() => {
  return (await getCurrentTrack())?.id
}
export const getCurrentTrack = async() => {
  const currentTrackIndex = await TrackPlayer.getCurrentTrack()
  return currentTrackIndex == null ? undefined : await TrackPlayer.getTrack(currentTrackIndex) as LX.Player.Track
}

export const getLoadedMusicIdentity = () => loadedMusicIdentity
export const resetLoadedMusicIdentity = () => {
  loadedMusicIdentity = ''
  loadedPlaybackSessionId = undefined
}

export const updateMetaData = async(musicInfo: LX.Player.MusicInfo, isPlay: boolean, lyric?: string, force = false) => {
  if (!force && isPlay == state.isPlaying) {
    const duration = await TrackPlayer.getDuration()
    if (state.prevDuration != duration) {
      state.prevDuration = duration
      const trackInfo = await getCurrentTrack()
      if (trackInfo && musicInfo) {
        delayUpdateMusicInfo(musicInfo, lyric)
      }
    }
  } else {
    const [duration, trackInfo] = await Promise.all([TrackPlayer.getDuration(), getCurrentTrack()])
    state.prevDuration = duration
    if (trackInfo && musicInfo) {
      delayUpdateMusicInfo(musicInfo, lyric)
    }
  }
}

const handlePlayMusic = async(musicInfo: LX.Player.PlayMusic, resource: PlayerResourceInput, time: number) => {
  const current = () => typeof resource == 'string' || !resource.signal?.aborted
  if (!current()) return
  const tracks = buildTracks(musicInfo, resource)
  const track = tracks[0]
  const musicIdentity = getMusicIdentity(musicInfo)
  // await updateMusicInfo(track)
  const currentTrackIndex = await TrackPlayer.getCurrentTrack()
  if (!current()) return
  await TrackPlayer.add(tracks).then(() => list.push(...tracks))
  try {
    const queue = await TrackPlayer.getQueue() as LX.Player.Track[]
    if (!current()) return
    // A skip can retain the previous playing state; pause before changing tracks.
    await TrackPlayer.pause()
    if (!current()) return
    await TrackPlayer.skip(queue.findIndex(t => t.id == track.id))
    if (!current()) return
    loadedMusicIdentity = musicIdentity
    loadedPlaybackSessionId = typeof resource == 'string' ? undefined : resource.sessionId

    if (currentTrackIndex == null) {
      if (!isTempTrack(track.id as string)) {
        if (time) await TrackPlayer.seekTo(time)
        if (global.lx.restorePlayInfo) {
          await TrackPlayer.pause()
          // let startupAutoPlay = settingState.setting['player.startupAutoPlay']
          global.lx.restorePlayInfo = null

          // TODO startupAutoPlay
          // if (startupAutoPlay) store.dispatch(playerAction.playMusic())
        } else {
          if (!current()) return
          await TrackPlayer.play()
        }
      }
    } else {
      await TrackPlayer.pause()
      if (!isTempTrack(track.id as string)) {
        await TrackPlayer.seekTo(time)
        if (!current()) return
        await TrackPlayer.play()
      }
    }

    if (queue.length > 2) {
      await TrackPlayer.remove(Array(queue.length - 2).fill(null).map((_, i) => i))
      list.splice(0, list.length - 2)
    }
  } finally {
    if (!current()) {
      const ids = new Set(tracks.map(item => item.id))
      if (ids.has((await getCurrentTrack())?.id ?? '')) await TrackPlayer.pause()
      const queue = await TrackPlayer.getQueue() as LX.Player.Track[]
      const indices = queue.flatMap((item, index) => ids.has(item.id) ? [index] : [])
      if (indices.length) await TrackPlayer.remove(indices)
      for (let index = list.length - 1; index >= 0; index--) if (ids.has(list[index].id)) list.splice(index, 1)
      if (loadedMusicIdentity == musicIdentity) resetLoadedMusicIdentity()
    }
  }
}
let playPromise = Promise.resolve()
let actionId = Math.random()
export const playMusic = (musicInfo: LX.Player.PlayMusic, resource: PlayerResourceInput, time: number) => {
  const id = actionId = Math.random()
  playPromise = playPromise.catch(() => {}).then(async() => {
    if (id != actionId) return
    await handlePlayMusic(musicInfo, resource, time)
  }).catch(() => {
    if (id == actionId && (typeof resource == 'string' || !resource.signal?.aborted)) global.app_event.playerError()
  })
}

// let musicId = null
// let duration = 0
let prevArtwork: string | undefined
const updateMetaInfo = async(mInfo: LX.Player.MusicInfo, lyric?: string) => {
  console.log('updateMetaInfo', lyric)
  const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
  // const mInfo = formatMusicInfo(musicInfo)
  // console.log('+++++updateMusicPic+++++', track.artwork, track.duration)

  // if (track.musicId == musicId) {
  //   if (global.playInfo.musicInfo.img != null) artwork = global.playInfo.musicInfo.img
  //   if (track.duration != null) duration = global.playInfo.duration
  // } else {
  //   musicId = track.musicId
  //   artwork = global.playInfo.musicInfo.img
  //   duration = global.playInfo.duration || 0
  // }
  // console.log('+++++updateMetaInfo+++++', mInfo.name)
  state.isPlaying = await TrackPlayer.getState() == State.Playing
  let artwork = isShowNotificationImage ? mInfo.pic ?? prevArtwork : undefined
  if (mInfo.pic) prevArtwork = mInfo.pic
  let name: string
  let singer: string
  if (!state.isPlaying || lyric == null) {
    name = mInfo.name ?? 'Unknow'
    singer = mInfo.singer ?? 'Unknow'
  } else {
    name = lyric
    singer = `${mInfo.name}${mInfo.singer ? ` - ${mInfo.singer}` : ''}`
  }
  await TrackPlayer.updateNowPlayingMetadata({
    title: name,
    artist: singer,
    album: mInfo.album ?? undefined,
    artwork,
    duration: state.prevDuration || 0,
  }, state.isPlaying)
}


// 解决快速切歌导致的通知栏歌曲信息与当前播放歌曲对不上的问题
const debounceUpdateMetaInfoTools = {
  updateMetaPromise: Promise.resolve(),
  musicInfo: null as LX.Player.MusicInfo | null,
  debounce(fn: (musicInfo: LX.Player.MusicInfo, lyric?: string) => void | Promise<void>) {
    // let delayTimer = null
    let isDelayRun = false
    let timer: number | null = null
    let _musicInfo: LX.Player.MusicInfo | null = null
    let _lyric: string | undefined
    return (musicInfo: LX.Player.MusicInfo, lyric?: string) => {
      // console.log('debounceUpdateMetaInfoTools', musicInfo)
      if (timer) {
        BackgroundTimer.clearTimeout(timer)
        timer = null
      }
      // if (delayTimer) {
      //   BackgroundTimer.clearTimeout(delayTimer)
      //   delayTimer = null
      // }
      if (isDelayRun) {
        _musicInfo = musicInfo
        _lyric = lyric
        timer = BackgroundTimer.setTimeout(() => {
          timer = null
          let musicInfo = _musicInfo
          let lyric = _lyric
          _musicInfo = null
          _lyric = undefined
          if (!musicInfo) return
          // isDelayRun = false
          void fn(musicInfo, lyric)
        }, 500)
      } else {
        isDelayRun = true
        void fn(musicInfo, lyric)
        BackgroundTimer.setTimeout(() => {
          // delayTimer = null
          isDelayRun = false
        }, 500)
      }
    }
  },
  init() {
    return this.debounce(async(musicInfo: LX.Player.MusicInfo, lyric?: string) => {
      this.musicInfo = musicInfo
      return this.updateMetaPromise.then(() => {
        // console.log('run')
        if (this.musicInfo?.id === musicInfo.id) {
          this.updateMetaPromise = updateMetaInfo(musicInfo, lyric)
        }
      })
    })
  },
}

export const delayUpdateMusicInfo = debounceUpdateMetaInfoTools.init()

// export const delayUpdateMusicInfo = ((fn, delay = 800) => {
//   let delayTimer = null
//   let isDelayRun = false
//   let timer = null
//   let _track = null
//   return track => {
//     _track = track
//     if (timer) {
//       BackgroundTimer.clearTimeout(timer)
//       timer = null
//     }
//     if (isDelayRun) {
//       if (delayTimer) {
//         BackgroundTimer.clearTimeout(delayTimer)
//         delayTimer = null
//       }
//       timer = BackgroundTimer.setTimeout(() => {
//         timer = null
//         let track = _track
//         _track = null
//         isDelayRun = false
//         fn(track)
//       }, delay)
//     } else {
//       isDelayRun = true
//       fn(track)
//       delayTimer = BackgroundTimer.setTimeout(() => {
//         delayTimer = null
//         isDelayRun = false
//       }, 500)
//     }
//   }
// })(track => {
//   console.log('+++++delayUpdateMusicPic+++++', track.artwork)
//   updateMetaInfo(track)
// })
