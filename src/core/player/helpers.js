const getTargetMusicInfo = musicInfo => {
  return musicInfo && 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
}

const createPlayerMusicIdentity = musicInfo => {
  const targetMusicInfo = getTargetMusicInfo(musicInfo)
  if (!targetMusicInfo) return ''
  return `${targetMusicInfo.source}:${targetMusicInfo.id}`
}

const createGettingUrlId = musicInfo => createPlayerMusicIdentity(musicInfo)

const shouldClearGettingUrlId = (requestMusicInfo, currentMusicInfo) => {
  return createPlayerMusicIdentity(requestMusicInfo) == createPlayerMusicIdentity(currentMusicInfo)
}

const shouldUseProjectSourceOnly = musicInfo => {
  const targetMusicInfo = getTargetMusicInfo(musicInfo)
  return targetMusicInfo?.source == 'wy'
}

const resolveProjectSourceResource = async({
  cachedMusicInfo,
  matchedList = [],
  getMatchedList,
  normalizeMusicInfo,
  canUse,
  getResource,
}) => {
  const seen = new Set()
  const tryCandidate = async(item, isCached = false) => {
    let musicInfo
    try {
      musicInfo = isCached ? item : normalizeMusicInfo(item)
    } catch {
      return null
    }
    const identity = createPlayerMusicIdentity(musicInfo)
    if (!identity || seen.has(identity) || !canUse(musicInfo)) return null
    seen.add(identity)
    try {
      const resource = await getResource(musicInfo)
      if (typeof resource == 'string' ? resource : resource?.url) return { musicInfo, resource }
    } catch {}
    return null
  }

  if (cachedMusicInfo) {
    const result = await tryCandidate(cachedMusicInfo, true)
    if (result) return result
  }
  const candidates = getMatchedList ? await getMatchedList() : matchedList
  for (const item of candidates) {
    const result = await tryCandidate(item)
    if (result) return result
  }
  return null
}

const runWithLoadingState = async(state, task) => {
  if (state.isLoading) return undefined
  state.isLoading = true
  try {
    return await task()
  } finally {
    state.isLoading = false
  }
}

module.exports = {
  getTargetMusicInfo,
  createPlayerMusicIdentity,
  createGettingUrlId,
  shouldClearGettingUrlId,
  shouldUseProjectSourceOnly,
  resolveProjectSourceResource,
  runWithLoadingState,
}
