import { getData, restoreData } from '@/plugins/storage'
import { getAllListsForBackup } from '@/screens/Home/Views/Setting/settings/Backup/actions'
import { getListeningTimeStats, getRecentPlayList, userApiRepository } from '@/utils/data'
import settingState from '@/store/setting/state'
import { prepareFullRestore, portableSettings } from './fullHelpers'
import { saveListeningTimeStatsNow } from '@/store/listeningTime/action'
import { pause } from '@/core/player/player'
import { playbackCoordinator } from '@/core/music/playbackSession'
import { invalidateSourceRuntimes } from '@/core/sourceRuntime'

export const createFullBackup = async(settingsOnly = false) => {
  await saveListeningTimeStatsNow()
  const setting = portableSettings(settingState.setting)
  if (settingsOnly) return { type: 'setting_v2', platform: 'mobile', data: setting }
  return {
    type: 'allData_v2',
    platform: 'mobile',
    schemaVersion: 1,
    setting,
    playList: await getAllListsForBackup(),
    mobile: {
      version: 1,
      userApis: await userApiRepository.readAll(),
      recentPlay: await getRecentPlayList(),
      listeningTime: await getListeningTimeStats(),
    },
  }
}
export const restoreFullBackup = async(backup: unknown) => {
  const current = await getData<LX.AppSetting>('@setting_v1') ?? settingState.setting
  const rows = prepareFullRestore(backup, current)
  // Validation completes before altering playback or persistent state.
  await pause()
  playbackCoordinator.invalidate()
  await invalidateSourceRuntimes()
  await restoreData(rows as Array<[string, unknown]>)
}
