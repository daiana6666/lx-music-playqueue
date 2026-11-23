const DESKTOP_REMOTE_SOURCE = 'desktop'
const { canonicalizeRemote } = require('./remote')
const MAX_USER_API_SCRIPT_LENGTH = 10 * 1024 * 1024

const sanitizeIdPart = id => String(id).replace(/[^a-zA-Z0-9_-]/g, '_')

const getManagedRemoteId = api => api.remoteSource == DESKTOP_REMOTE_SOURCE
  ? api.remoteId ?? api.id
  : null

const createManagedApiId = (remoteId, usedIds) => {
  const baseId = `user_api_sync_${sanitizeIdPart(remoteId)}`
  if (!usedIds.has(baseId)) return baseId
  let index = 1
  while (usedIds.has(`${baseId}_${index}`)) index++
  return `${baseId}_${index}`
}

const normalizeSyncApiInfo = (api, existingApi, usedIds = new Set()) => {
  const id = existingApi?.id ?? createManagedApiId(api.id, usedIds)
  usedIds.add(id)
  return {
    id,
    name: api.name ?? '',
    description: api.description ?? '',
    author: api.author ?? '',
    homepage: api.homepage ?? '',
    version: api.version ?? '',
    allowShowUpdateAlert: api.allowShowUpdateAlert ?? true,
    remoteId: api.id,
    remoteSource: DESKTOP_REMOTE_SOURCE,
    ...(api.remote == null && existingApi?.remote == null ? {} : { remote: canonicalizeRemote(api.remote ?? existingApi?.remote) }),
  }
}

const normalizeApiInfoForSync = (api, script) => ({
  id: api.remoteId ?? api.id,
  name: api.name ?? '',
  description: api.description ?? '',
  author: api.author ?? '',
  homepage: api.homepage ?? '',
  version: api.version ?? '',
  allowShowUpdateAlert: api.allowShowUpdateAlert ?? true,
  ...(api.remote == null ? {} : { remote: canonicalizeRemote(api.remote) }),
  scriptEncoding: 'plain',
  script,
})

const validateUserApiSyncData = data => {
  if (!data || data.source != DESKTOP_REMOTE_SOURCE) throw new Error('Only desktop userApi sync data is supported')
  if (!Array.isArray(data.apis)) throw new Error('Invalid userApi sync data')
  if (typeof data.updatedAt != 'number' || !Number.isFinite(data.updatedAt)) throw new Error('Invalid userApi updatedAt')
  const apiIds = new Set()
  for (const api of data.apis) {
    if (!api || typeof api != 'object') throw new Error('Invalid userApi sync data')
    try { canonicalizeRemote(api.remote) } catch (error) { throw new Error(`${api.id}: ${error.message}`) }
    if (api.scriptEncoding != 'plain') throw new Error('Only plain userApi sync scripts are supported')
    if (typeof api.id != 'string' || !api.id) throw new Error('Invalid userApi id')
    if (apiIds.has(api.id)) throw new Error('Duplicate userApi id')
    apiIds.add(api.id)
    if (typeof api.script != 'string' || api.script.length > MAX_USER_API_SCRIPT_LENGTH) throw new Error('Invalid userApi script')
    for (const field of ['name', 'description', 'author', 'homepage', 'version']) {
      if (typeof api[field] != 'string') throw new Error(`Invalid userApi ${field}`)
    }
    if (api.allowShowUpdateAlert != null && typeof api.allowShowUpdateAlert != 'boolean') {
      throw new Error('Invalid userApi allowShowUpdateAlert')
    }
    if (!/^\/\*[\S|\s]+?\*\//.test(api.script)) throw new Error('Invalid custom source script')
  }
}

const buildUserApiOverwrite = (existingApis, data) => {
  validateUserApiSyncData(data)

  const existingApisByRemoteId = new Map()
  const existingApisById = new Map()
  const usedIds = new Set()
  const usedExistingIds = new Set()
  const scriptsToSave = []
  const incomingIds = new Set(data.apis.map(api => api.id))
  const preservedApis = existingApis.filter(api => {
    return api.remoteSource != DESKTOP_REMOTE_SOURCE && !incomingIds.has(api.id)
  })

  for (const api of existingApis) {
    const remoteId = getManagedRemoteId(api)
    if (remoteId) existingApisByRemoteId.set(remoteId, api)
    existingApisById.set(api.id, api)
  }
  for (const api of preservedApis) usedIds.add(api.id)

  const managedApis = data.apis.map(api => {
    const matchedApi = existingApisByRemoteId.get(api.id) ?? existingApisById.get(api.id)
    const existingApi = matchedApi && !usedIds.has(matchedApi.id) ? matchedApi : undefined
    const nextInfo = normalizeSyncApiInfo(api, existingApi, usedIds)
    usedExistingIds.add(nextInfo.id)
    scriptsToSave.push([nextInfo.id, api.script])
    return nextInfo
  })
  const nextApis = [...preservedApis, ...managedApis]

  const removedScriptIds = []
  for (const api of existingApis) {
    if (api.remoteSource == DESKTOP_REMOTE_SOURCE && !usedExistingIds.has(api.id)) removedScriptIds.push(api.id)
  }

  return {
    nextApis,
    removedScriptIds,
    scriptsToSave,
  }
}

const buildUserApiSyncData = async(apis, getScript, updatedAt = Date.now()) => {
  const syncApis = []
  for (const api of apis) {
    if (!api?.id) continue
    syncApis.push(normalizeApiInfoForSync(api, await getScript(api.id)))
  }
  return {
    source: DESKTOP_REMOTE_SOURCE,
    updatedAt,
    apis: syncApis,
  }
}

const getUserApiSyncComparableData = data => {
  validateUserApiSyncData(data)
  return {
    source: DESKTOP_REMOTE_SOURCE,
    apis: data.apis.map(api => ({
      id: api.id,
      name: api.name ?? '',
      description: api.description ?? '',
      author: api.author ?? '',
      homepage: api.homepage ?? '',
      version: api.version ?? '',
      allowShowUpdateAlert: api.allowShowUpdateAlert,
      ...(api.remote == null ? {} : { remote: canonicalizeRemote(api.remote) }),
      scriptEncoding: api.scriptEncoding,
      script: api.script,
    })),
  }
}

const resolveSyncedApiSource = (activeApiId, nextApis, fallbackApiId) => {
  if (!/^user_api/.test(activeApiId)) return activeApiId
  return nextApis.some(api => api.id == activeApiId) ? activeApiId : fallbackApiId
}

module.exports = {
  DESKTOP_REMOTE_SOURCE,
  buildUserApiSyncData,
  buildUserApiOverwrite,
  getUserApiSyncComparableData,
  normalizeApiInfoForSync,
  normalizeSyncApiInfo,
  resolveSyncedApiSource,
  validateUserApiSyncData,
}
