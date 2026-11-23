import { getUserApiSyncData, setUserApiSyncData } from '@/core/userApi'
import { getClient } from '@/plugins/sync/client'

const getReadyUserApiQueue = () => {
  const client = getClient()
  if (!client?.isReady || !client.moduleReadys?.userApi) {
    throw new Error(global.i18n.t('setting_basic_source_sync_not_ready'))
  }
  return client.remoteQueueUserApi
}

export const getRemoteUserApiMeta = async() => {
  return getReadyUserApiQueue().user_api_get_meta()
}

export const pullUserApiFromServer = async(mode: LX.Sync.UserApi.SyncMode) => {
  const queue = getReadyUserApiQueue()
  const data = mode == 'merge'
    ? await queue.user_api_pull(mode, await getUserApiSyncData())
    : await queue.user_api_pull(mode)
  await setUserApiSyncData(data)
  return data
}

export const pushUserApiToServer = async(mode: LX.Sync.UserApi.SyncMode) => {
  const queue = getReadyUserApiQueue()
  return queue.user_api_push(await getUserApiSyncData(), mode)
}
