import { action, state } from '@/store/userApi'
import { addUserApi, getUserApiSyncData as getUserApiSyncDataFromStore, overwriteDesktopUserApis, removeUserApi as removeUserApiFromStore, setUserApiAllowShowUpdateAlert as setUserApiAllowShowUpdateAlertFromStore, userApiRepository } from '@/utils/data'
import { invalidateSourceRuntimes, loadPrimarySource } from '@/core/sourceRuntime'
import { log as writeLog } from '@/utils/log'
import settingState from '@/store/setting/state'
import apiSourceInfo from '@/utils/musicSdk/api-source-info'
import { resolveSyncedApiSource } from '@/core/userApiSync/helpers'
import { createGitHubClient, buildGitHubReplacement } from '@/core/userApiSync/githubClient'
import { playbackCoordinator } from '@/core/music/playbackSession'


export const setUserApi = async(apiId: string) => {
  global.lx.qualityList = {}
  global.lx.apis = {}
  setUserApiStatus(false, 'initing')

  const target = state.list.find(api => api.id === apiId)
  if (!target) throw new Error('api not found')
  const result = await loadPrimarySource(target).catch(error => {
    if (settingState.setting['common.apiSource'] == apiId) {
      setUserApiStatus(false, '音源初始化失败')
      if (!global.lx.apiInitPromise[1]) global.lx.apiInitPromise[2](false)
    }
    throw error
  })
  if (settingState.setting['common.apiSource'] != apiId) return
  global.lx.apis = result.apis
  global.lx.qualityList = result.qualitys
  setUserApiStatus(true, '')
  if (!global.lx.apiInitPromise[1]) global.lx.apiInitPromise[2](true)
  global.state_event.apiSourceUpdated(apiId)
}

export const destroyUserApi = () => {
  void invalidateSourceRuntimes()
}


export const setUserApiStatus: typeof action['setStatus'] = (status, message) => {
  action.setStatus(status, message)
}

export const setUserApiList: typeof action['setUserApiList'] = (list) => {
  action.setUserApiList(list)
}

export const importUserApi = async(script: string) => {
  const info = await addUserApi(script)
  action.addUserApi(info)
}

export const removeUserApi = async(ids: string[]) => {
  playbackCoordinator.invalidate()
  await invalidateSourceRuntimes(ids)
  const list = await removeUserApiFromStore(ids)
  action.setUserApiList(list)
}

export const getUserApiSyncData = async() => {
  return getUserApiSyncDataFromStore()
}

export const setUserApiSyncData = async(data: LX.Sync.UserApi.Data) => {
  const list = await overwriteDesktopUserApis(data)
  await applyUpdatedUserApiList(list)
}

const applyUpdatedUserApiList = async(list: LX.UserApi.UserApiInfo[]) => {
  playbackCoordinator.invalidate()
  await invalidateSourceRuntimes()
  action.setUserApiList(list)
  const activeApiId = settingState.setting['common.apiSource']
  const fallbackApiId = apiSourceInfo.find(api => !api.disabled)?.id ?? ''
  const nextApiId = resolveSyncedApiSource(activeApiId, list, fallbackApiId)
  if (!/^user_api/.test(nextApiId)) {
    const { setApiSource } = await import('./apiSource')
    setApiSource(nextApiId)
    return
  }
  await setUserApi(nextApiId)
}

let githubUpdate: Promise<{ count: number, skipped: string[], version: string }> | null = null
export const updateGitHubUserApis = async() => {
  githubUpdate ??= (async() => {
    const client = createGitHubClient()
    const { snapshot, items } = await (async() => {
      try {
        const snapshot = await client.getSnapshot()
        return { snapshot, items: await client.downloadSnapshot(snapshot) }
      } catch (error: any) {
        error.existingSourcesRetained = true
        throw error
      }
    })()
    let skipped: string[] = []
    const list = await userApiRepository.mutate(existing => {
      const result = buildGitHubReplacement(existing, items)
      skipped = result.skipped
      return result
    })
    await applyUpdatedUserApiList(list)
    return { count: items.length - skipped.length, skipped, version: snapshot.version }
  })().finally(() => { githubUpdate = null })
  return githubUpdate
}

export const setUserApiAllowShowUpdateAlert = async(id: string, enable: boolean) => {
  await setUserApiAllowShowUpdateAlertFromStore(id, enable)
  action.setUserApiAllowShowUpdateAlert(id, enable)
}

export const log = {
  r_info(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeLog.info(...params)
  },
  r_warn(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeLog.warn(...params)
  },
  r_error(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeLog.error(...params)
  },
  log(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (global.lx.isEnableUserApiLog) writeLog.info(...params)
  },
  info(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (global.lx.isEnableUserApiLog) writeLog.info(...params)
  },
  warn(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (global.lx.isEnableUserApiLog) writeLog.warn(...params)
  },
  error(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (global.lx.isEnableUserApiLog) writeLog.error(...params)
  },
}
