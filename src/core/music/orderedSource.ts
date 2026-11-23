import { NativeModules } from 'react-native'
import settingState from '@/store/setting/state'
import { state } from '@/store/userApi'
import { getSourceRuntime, requestSource, sourceFingerprint } from '@/core/sourceRuntime'
import { toOldMusicInfo } from '@/utils'
import { getOtherSource } from './utils'
import { assertPlaybackCurrent, playbackCoordinator, resolveInOrder, type ResolvedAudio } from './playbackSession'

const qualityOrder: LX.Quality[] = ['flac24bit', 'flac', '320k', '128k']
let probeSequence = 0
export const validateAudio = async(url: string, signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('cancel request')
  const id = `audio:${++probeSequence}`
  const cancel = () => { NativeModules.MediaProbe.cancel(id) }
  signal?.addEventListener('abort', cancel, { once: true })
  try { await NativeModules.MediaProbe.validate(id, url, {}) } finally { signal?.removeEventListener('abort', cancel) }
  if (signal?.aborted) throw new Error('cancel request')
}
export const resolveOrderedSource = async({ musicInfo, quality, signal, isRefresh = false, allowToggleSource = true, onToggleSource }: {
  musicInfo: LX.Music.MusicInfoOnline | LX.Music.MusicInfoLocal
  quality?: LX.Quality
  signal?: AbortSignal
  isRefresh?: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<ResolvedAudio> => {
  const revision = playbackCoordinator.revision()
  const targetQuality = quality ?? settingState.setting['player.playQuality']
  const main = settingState.setting['common.apiSource']
  const disabled = settingState.setting['player.disabledFallbackSources']
  const sourceIds = [main, ...settingState.setting['player.fallbackSources'].filter(id => !disabled.includes(id))]
    .filter(id => state.list.some(info => info.id == id))
  if (!sourceIds.length) throw new Error('请选择主音源或启用备用音源')
  let candidates: LX.Music.MusicInfoOnline[] | null = null
  return resolveInOrder(sourceIds, async sourceId => {
    assertPlaybackCurrent(signal, revision)
    const info = state.list.find(item => item.id == sourceId)!
    const key = JSON.stringify([sourceFingerprint(info), revision, musicInfo.source, musicInfo.id, targetQuality])
    const cached = !isRefresh && playbackCoordinator.read(key)
    if (cached) return cached
    const runtime = await getSourceRuntime(sourceId)
    const attempt = async(song: LX.Music.MusicInfoOnline | LX.Music.MusicInfoLocal) => {
      assertPlaybackCurrent(signal, revision)
      const capability = runtime.sources[song.source]
      if (!capability?.actions.includes('musicUrl')) throw new Error('音源不支持此平台')
      const supported = qualityOrder.slice(Math.max(0, qualityOrder.indexOf(targetQuality)))
      const availableQuality = supported.find(item => capability.qualitys.includes(item) && (item == '128k' || ('_qualitys' in song.meta && !!song.meta._qualitys[item])))
      if (!availableQuality) throw new Error('音源不支持目标音质')
      const response = await requestSource(sourceId, song.source, 'musicUrl', toOldMusicInfo(song), availableQuality, signal)
      assertPlaybackCurrent(signal, revision)
      const url: unknown = response?.data?.url
      if (typeof url != 'string' || !/^https?:\/\//i.test(url)) throw new Error('音源未返回音频地址')
      await validateAudio(url, signal)
      assertPlaybackCurrent(signal, revision)
      const reported: unknown = response.data.quality
      const resource: ResolvedAudio = { url, quality: qualityOrder.includes(reported as LX.Quality) ? reported as LX.Quality : null, targetQuality, availableQuality, sourceId, validated: true }
      playbackCoordinator.commit(key, resource, revision, signal)
      return resource
    }
    try { return await attempt(musicInfo) } catch (error) {
      assertPlaybackCurrent(signal, revision)
      if (!allowToggleSource) throw error
    }
    // Each source attempt is serial within this resolution.
    // eslint-disable-next-line require-atomic-updates
    candidates ??= await getOtherSource(musicInfo).catch(() => [])
    assertPlaybackCurrent(signal, revision)
    for (const candidate of candidates) {
      if (candidate.source == musicInfo.source) continue
      try { onToggleSource?.(candidate); return await attempt(candidate) } catch {
        assertPlaybackCurrent(signal, revision)
      }
    }
    throw new Error('此音源的歌曲候选均不可播放')
  }, signal)
}
