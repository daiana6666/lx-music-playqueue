const { createPlayerMusicIdentity, getTargetMusicInfo } = require('./helpers')

const isPlayableRecord = value => !!(value && typeof value.id == 'string' && value.id &&
  ['kw', 'kg', 'tx', 'wy', 'mg', 'local', 'webdav'].includes(value.source) &&
  value.meta && typeof value.meta == 'object')

const findQueueEntry = (list, entry) => list.find(item => item === entry)

const entryIds = new WeakMap()
let nextEntryId = 0
const entryKey = entry => {
  if (!entryIds.has(entry)) entryIds.set(entry, ++nextEntryId)
  return entryIds.get(entry)
}

const buildQueueSections = ({ current, temp, history, playlist, candidates, listId, playerIndex, mode, randomNext, privateFm, room }) => {
  const identity = createPlayerMusicIdentity(current.musicInfo)
  const row = (kind, entry, key) => ({ kind, entry, key: `${kind}:${key}` })
  const sections = []
  const add = (kind, data) => { if (data.length) sections.push({ kind, data }) }
  add('current', current.musicInfo ? [row('current', current, identity)] : [])
  if (room?.playback.queue.length) {
    const queue = room.playback.queue
    const found = createPlayerMusicIdentity(queue[room.playback.currentIndex]?.musicInfo) == identity ? room.playback.currentIndex : queue.findIndex(item => createPlayerMusicIdentity(item.musicInfo) == identity)
    const index = found < 0 ? room.playback.currentIndex : found
    add('pending', queue.slice(index + 1).map(item => ({
      ...row('party', { musicInfo: item.musicInfo, listId: null, isTempPlay: true }, `${room.roomId}:${item.id}`),
      partyId: item.id,
      roomId: room.roomId,
    })))
    return sections
  }
  add('later', temp.map(entry => row('later', entry, entryKey(entry))))
  const anchor = current.isTempPlay ? createPlayerMusicIdentity(playlist[playerIndex]) : identity
  const historyIndex = history.findIndex(item => createPlayerMusicIdentity(item.musicInfo) == anchor)
  const future = history.slice(historyIndex + 1).filter(entry => entry.listId != listId || playlist.some(music => createPlayerMusicIdentity(music) == createPlayerMusicIdentity(entry.musicInfo)))
  let pending = []
  if (!privateFm && randomNext) {
    pending = [row('random', randomNext, `${listId}:${createPlayerMusicIdentity(randomNext.musicInfo)}`)]
  } else if (!privateFm && future.length) {
    pending = future.map(entry => row('history', entry, entryKey(entry)))
  } else if (privateFm || mode == 'list' || mode == 'listLoop') {
    const pendingList = !privateFm && candidates ? candidates.list : playlist
    const found = pendingList.findIndex(item => createPlayerMusicIdentity(item) == anchor)
    const index = !privateFm && candidates ? candidates.index : found < 0 ? playerIndex : found
    const songs = pendingList.slice(index + 1)
    if (!privateFm && mode == 'listLoop' && index >= 0) songs.push(...pendingList.slice(0, index))
    pending = songs.map(musicInfo => row('pending', { musicInfo, listId, isTempPlay: false }, `${listId}:${createPlayerMusicIdentity(musicInfo)}`))
  }
  add('pending', pending)
  add('history', (historyIndex < 0 ? history : history.slice(0, historyIndex)).filter(entry => createPlayerMusicIdentity(entry.musicInfo) != identity).map(entry => row('history', entry, entryKey(entry))))
  return sections
}

module.exports = { isPlayableRecord, findQueueEntry, buildQueueSections, createPlayerMusicIdentity, getTargetMusicInfo }
