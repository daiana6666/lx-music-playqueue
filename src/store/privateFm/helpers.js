const getMusicIdentity = musicInfo => `${musicInfo?.source ?? ''}:${musicInfo?.id ?? ''}`

const appendUniqueMusicInfos = (currentList, nextList) => {
  const identities = new Set(currentList.map(getMusicIdentity))
  const result = [...currentList]
  for (const musicInfo of nextList) {
    const identity = getMusicIdentity(musicInfo)
    if (!musicInfo?.id || identities.has(identity)) continue
    identities.add(identity)
    result.push(musicInfo)
  }
  return result
}

module.exports = {
  appendUniqueMusicInfos,
  getMusicIdentity,
}
