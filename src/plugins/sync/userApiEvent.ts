import { getUserApiSyncData, setUserApiSyncData } from '@/core/userApi'
import { getUserApiSyncComparableData } from '@/core/userApiSync/helpers'
import { toast, toMD5 } from '@/utils/tools'

export const getLocalUserApiData = async(): Promise<LX.Sync.UserApi.Data> => {
  return getUserApiSyncData()
}

export const getLocalUserApiMD5 = async(): Promise<string> => {
  return toMD5(JSON.stringify(getUserApiSyncComparableData(await getLocalUserApiData())))
}

export const setLocalUserApiData = async(data: LX.Sync.UserApi.Data): Promise<void> => {
  await setUserApiSyncData(data)
}

export const handleRemoteUserApiAction = async(event: LX.Sync.UserApi.ActionList) => {
  switch (event.action) {
    case 'user_api_data_changed':
      toast(global.i18n.t('setting_basic_source_sync_changed_tip', { count: event.data.count }), 'long')
      break
    default:
      throw new Error('unknown userApi sync action')
  }
}
