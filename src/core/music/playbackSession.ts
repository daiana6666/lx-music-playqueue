export interface ResolvedAudio {
  url: string
  headers?: Record<string, string>
  quality: LX.Quality | null
  targetQuality: LX.Quality
  availableQuality: LX.Quality
  sourceId: string
  validated: boolean
}
export const createPlaybackCoordinator = () => {
  const lanes = new Map<string, AbortController>()
  let revision = 0
  const cache = new Map<string, { expires: number, resource: ResolvedAudio }>()
  return {
    begin(lane: 'play' | 'preload') {
      lanes.get(lane)?.abort()
      const controller = new AbortController()
      lanes.set(lane, controller)
      return controller.signal
    },
    cancel(lane: 'play' | 'preload') { lanes.get(lane)?.abort(); lanes.delete(lane) },
    invalidate() { revision++; cache.clear(); for (const lane of lanes.values()) lane.abort(); lanes.clear() },
    revision: () => revision,
    read(key: string, now = Date.now()) {
      const value = cache.get(key)
      if (!value || value.expires < now) { cache.delete(key); return null }
      return { ...value.resource }
    },
    commit(key: string, resource: ResolvedAudio, expected: number, signal?: AbortSignal, now = Date.now()) {
      if (signal?.aborted === true || expected != revision || !resource.validated) return false
      if (cache.size >= 128) cache.delete(cache.keys().next().value!)
      cache.set(key, { expires: now + 10 * 60 * 1000, resource: { ...resource } })
      return true
    },
  }
}
export const playbackCoordinator = createPlaybackCoordinator()
export const assertPlaybackCurrent = (signal: AbortSignal | undefined, revision: number) => {
  if (signal?.aborted === true || playbackCoordinator.revision() != revision) throw new Error('cancel request')
}
export const resolveInOrder = async<T>(items: string[], attempt: (id: string) => Promise<T>, signal?: AbortSignal): Promise<T> => {
  const errors: string[] = []
  for (const id of [...new Set(items)].filter(Boolean)) {
    if (signal?.aborted) throw new Error('cancel request')
    try {
      const result = await attempt(id)
      if (signal?.aborted) throw new Error('cancel request')
      return result
    } catch (error: any) {
      if (signal?.aborted === true || error.message == 'cancel request') throw error
      errors.push(`${id}: ${String(error.message)}`)
    }
  }
  throw new Error(`所有已启用音源均未能返回可播放音频（${errors.length} 个）。请检查网络或更新音源。`)
}
