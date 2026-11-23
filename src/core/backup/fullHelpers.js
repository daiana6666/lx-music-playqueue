const { validatePlaylistBackup, getBackupProfiles } = require('./helpers')
const { normalizeListeningTimeStats, normalizeRecentPlayList } = require('../netease/helpers')
const { validateUserApiSyncData } = require('../userApiSync/helpers')
const { canonicalizeRemote } = require('../userApiSync/remote')
const { isRecord } = require('../listProfile/helpers')

const portableSettingKey = key => !/password|cookie|token|secret|auth|sync|webdav|path|directory|device|window|tray|hotkey|apiSource|fallbackSources|disabledFallbackSources/i.test(key)
const portableSettings = setting => Object.fromEntries(Object.entries(setting).filter(([key]) => portableSettingKey(key)))
const mapSettings = (incoming, current) => {
  if (!isRecord(incoming)) throw new Error('备份设置格式无效')
  const next = { ...current, 'webdav.password': '' }
  for (const [key, value] of Object.entries(incoming)) {
    if (!portableSettingKey(key) || !Object.prototype.hasOwnProperty.call(current, key) || key == 'version') continue
    if (Array.isArray(current[key])) {
      if (Array.isArray(value) && value.length <= 200 && value.every(item => ['string', 'number', 'boolean'].includes(typeof item))) next[key] = value
    } else if (typeof value == typeof current[key] && ['string', 'boolean', 'number'].includes(typeof value) && (typeof value != 'number' || Number.isFinite(value))) next[key] = value
  }
  return next
}
const prepareFullRestore = (value, current) => {
  if (!isRecord(value)) throw new Error('备份格式无效')
  if (value.type == 'setting_v2') return [['@setting_v1', mapSettings(value.data, current)]]
  if (value.type != 'allData_v2') throw new Error('请选择完整备份或设置备份')
  validatePlaylistBackup(value)
  const rows = [['@setting_v1', mapSettings(value.setting, current)]]
  const lists = value.playList
  const users = []
  for (const item of lists) {
    const id = String(item.id)
    if (['temp', 'download', 'webdav'].includes(id)) continue
    if (id.length > 256 || [...id].some(char => char.charCodeAt(0) < 32)) throw new Error('歌单标识无效')
    // Only ordinary playlist fields are restored, never account management flags.
    if (id != 'default' && id != 'love') users.push({ id, name: item.name, source: item.source, sourceListId: item.sourceListId, locationUpdateTime: null })
    rows.push([`@list__${id}`, item.list])
  }
  if (!lists.some(item => item.id == 'default')) rows.push(['@list__default', []])
  if (!lists.some(item => item.id == 'love')) rows.push(['@list__love', []])
  rows.push(['@user_list', users], ['@playlist_profiles_v1', { profiles: getBackupProfiles(lists), collapsed: {} }])
  if (value.mobile != null) {
    if (!isRecord(value.mobile) || value.mobile.version != 1) throw new Error('不支持的手机版备份版本')
    const { userApis, recentPlay, listeningTime } = value.mobile
    if (!Array.isArray(userApis) || userApis.length > 1000 || !Array.isArray(recentPlay) || recentPlay.length > 520 || !isRecord(listeningTime)) throw new Error('手机版备份数据无效')
    validateUserApiSyncData({ source: 'desktop', updatedAt: 0, apis: userApis.map(api => ({ ...api, scriptEncoding: 'plain' })) })
    const apis = []
    const scripts = {}
    for (const api of userApis) {
      if (!api.id.startsWith('user_api') || api.id.length > 256) throw new Error('音源标识无效')
      const key = `@user_api__:restore:${encodeURIComponent(api.id)}`
      const managed = api.remoteSource == 'desktop' && typeof api.remoteId == 'string' && api.remoteId.length > 0 && api.remoteId.length <= 256
        ? { remoteSource: 'desktop', remoteId: api.remoteId }
        : {}
      apis.push({ id: api.id, name: api.name, description: api.description, author: api.author, homepage: api.homepage, version: api.version, allowShowUpdateAlert: api.allowShowUpdateAlert !== false, ...managed, ...(api.remote ? { remote: canonicalizeRemote(api.remote) } : {}) })
      scripts[api.id] = key
      rows.push([key, api.script])
    }
    const stats = normalizeListeningTimeStats(listeningTime)
    stats.activeSession = null
    rows.push(['@user_api_catalog_v1', { apis, scripts }], ['@recent_play_list', normalizeRecentPlayList(recentPlay)], ['@listening_time_stats', stats])
    // Device preference stays local; discard IDs absent from the restored catalog.
    const setting = rows[0][1]
    const ids = new Set(apis.map(api => api.id))
    if (!ids.has(setting['common.apiSource'])) setting['common.apiSource'] = ''
    setting['player.fallbackSources'] = (current['player.fallbackSources'] ?? []).filter(id => ids.has(id))
    setting['player.disabledFallbackSources'] = (current['player.disabledFallbackSources'] ?? []).filter(id => ids.has(id))
  }
  return rows
}
module.exports = { portableSettings, mapSettings, prepareFullRestore }
