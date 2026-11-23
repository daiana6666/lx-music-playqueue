const { Inflate } = require('pako')
const { isRecord, normalizeProfile } = require('../listProfile/helpers')
const MAX_BACKUP_BYTES = 64 * 1024 * 1024

const decodeBackup = bytes => {
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds 64 MiB')
  let text
  if ((bytes[0] == 0x1f && bytes[1] == 0x8b) || bytes[0] == 0x78) {
    const inflater = new Inflate({ to: 'string', chunkSize: 16384 })
    const chunks = []
    let length = 0
    inflater.onData = chunk => {
      length += Buffer.byteLength(chunk, 'utf8')
      if (length > MAX_BACKUP_BYTES) throw new Error('Expanded backup exceeds 64 MiB')
      chunks.push(chunk)
    }
    inflater.push(bytes, true)
    if (inflater.err || !inflater.ended) throw new Error('Invalid or incomplete compressed backup')
    text = chunks.join('')
  } else text = Buffer.from(bytes).toString('utf8')
  let data = JSON.parse(text.replace(/^\uFEFF/, ''))
  if (typeof data == 'string') data = JSON.parse(data)
  return data
}

const validatePlaylistBackup = value => {
  if (!isRecord(value)) throw new Error('Invalid backup object')
  const supported = ['defautlList', 'playList', 'playList_v2', 'allData', 'allData_v2', 'playListPart', 'playListPart_v2']
  if (!supported.includes(value.type)) throw new Error(`Unsupported backup type: ${String(value.type)}`)
  let lists = value.type.startsWith('allData') ? value.playList ?? [value.defaultList] : value.data
  if (value.type == 'defautlList' || value.type.startsWith('playListPart')) lists = [lists]
  if (!Array.isArray(lists) || lists.length > 10000) throw new Error('Invalid playlist collection')
  const ids = new Set()
  for (const list of lists) {
    if (!isRecord(list) || !['string', 'number'].includes(typeof list.id) || !String(list.id) || typeof list.name != 'string' || !Array.isArray(list.list)) throw new Error('Invalid playlist')
    if (ids.has(String(list.id))) throw new Error(`Duplicate playlist ID: ${list.id}`)
    ids.add(String(list.id))
    if (['__proto__', 'constructor', 'prototype'].includes(String(list.id))) throw new Error('Invalid playlist ID')
    if (list.list.length > 100000) throw new Error('Playlist exceeds 100,000 songs')
    if (value.type.endsWith('_v2')) {
      for (const song of list.list) {
        if (!isRecord(song) || typeof song.id != 'string' || !song.id || typeof song.name != 'string' || typeof song.singer != 'string' || !['kw', 'kg', 'tx', 'wy', 'mg', 'local', 'webdav'].includes(song.source) || !isRecord(song.meta)) throw new Error(`Invalid song in playlist: ${list.name}`)
      }
    }
    if (list.profile != null && !isRecord(list.profile)) throw new Error(`Invalid playlist profile: ${list.name}`)
  }
  return value
}
const getBackupProfiles = lists => Object.fromEntries(lists.filter(list => list.profile != null || list.group == 'mine' || list.group == 'external').map(list => [String(list.id), normalizeProfile({ group: list.group, ...list.profile })]))
module.exports = { MAX_BACKUP_BYTES, decodeBackup, validatePlaylistBackup, getBackupProfiles }
