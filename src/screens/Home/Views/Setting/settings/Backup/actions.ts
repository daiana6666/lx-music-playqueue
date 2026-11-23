import { LIST_IDS } from '@/config/constant'
import { createList, getListMusics, overwriteList, overwriteListFull } from '@/core/list'
import { filterMusicList, fixNewMusicInfoQuality, toNewMusicInfo } from '@/utils'
import { log } from '@/utils/log'
import { confirmDialog, handleReadFile, handleSaveFile, toast } from '@/utils/tools'
import { applyListProfiles, getListProfiles } from '@/core/listProfile'
import { getBackupProfiles, validatePlaylistBackup } from '@/core/backup/helpers'
import listState from '@/store/list/state'

type BackupList = LX.ConfigFile.MyListInfoPart['data']
interface PlaylistBackup { type: string, data: BackupList[] | BackupList, playList?: BackupList[], defaultList?: BackupList }

export const getAllListsForBackup = async(): Promise<BackupList[]> => {
  const profiles = await getListProfiles()
  const lists = [listState.defaultList, listState.loveList, ...listState.userList]
  return Promise.all(lists.map(async list => ({ ...list, list: await getListMusics(list.id), ...(profiles[list.id] ? { profile: profiles[list.id], group: profiles[list.id].group } : {}) })))
}

const prepareList = (list: BackupList, legacy: boolean): BackupList => ({
  ...list,
  id: String(list.id),
  locationUpdateTime: (list as LX.List.UserListInfo).locationUpdateTime ?? null,
  list: filterMusicList(legacy ? list.list.map(m => toNewMusicInfo(m)) : list.list).map(m => fixNewMusicInfoQuality(m)),
})

export const handleImportListPart = async(listData: BackupList, position: number = listState.userList.length) => {
  validatePlaylistBackup({ type: 'playListPart_v2', data: listData })
  const target = listState.allList.find(list => list.id == listData.id)
  const confirmed = await confirmDialog({
    message: target ? global.i18n.t('list_import_part_confirm', { importName: listData.name, localName: target.name }) : global.i18n.t('list_import_part_confirm_tip'),
    cancelButtonText: global.i18n.t('dialog_cancel'),
    confirmButtonText: global.i18n.t('confirm_button_text'),
    bgClose: false,
  })
  if (!confirmed) return
  const { profile, group, ...list } = prepareList(listData, false)
  if (target) await overwriteList({ ...list, name: target.name, locationUpdateTime: (list as LX.List.UserListInfo).locationUpdateTime ?? null })
  else await createList({ ...list, position: Math.max(position, -1) })
  await applyListProfiles(getBackupProfiles([{ ...list, profile, group }]))
  toast(global.i18n.t('setting_backup_part_import_list_tip_success'))
}

export const importPlaylistFile = async(path: string, position?: number) => {
  const backup = validatePlaylistBackup(await handleReadFile<PlaylistBackup>(path))
  const legacy = !backup.type.endsWith('_v2')
  if (backup.type.startsWith('playListPart')) {
    await handleImportListPart(prepareList(backup.data as BackupList, legacy), position)
    return
  }
  const isAllData = backup.type.startsWith('allData')
  const incoming = (isAllData ? backup.playList ?? [backup.defaultList!] : backup.type == 'defautlList' ? [backup.data as BackupList] : backup.data as BackupList[]).map(list => prepareList(list, legacy))
  if (!await confirmDialog({
    message: isAllData ? global.i18n.t('phase1_backup_lists_only') : global.i18n.t('list_import_part_confirm_tip'),
    bgClose: false,
  })) return
  const allLists = await getAllListsForBackup()
  for (const list of incoming) {
    const index = allLists.findIndex(item => item.id == list.id)
    if (index < 0) allLists.push(list)
    else allLists[index] = { ...allLists[index], list: list.list }
  }
  await overwriteListFull({
    defaultList: allLists.find(list => list.id == LIST_IDS.DEFAULT)!.list,
    loveList: allLists.find(list => list.id == LIST_IDS.LOVE)!.list,
    userList: allLists.filter(list => list.id != LIST_IDS.DEFAULT && list.id != LIST_IDS.LOVE).map(({ profile, group, ...list }) => list as LX.List.UserListInfoFull),
  })
  await applyListProfiles(getBackupProfiles(incoming))
  toast(global.i18n.t('setting_backup_part_import_list_tip_success'))
}

export const handleImportList = (path: string) => {
  toast(global.i18n.t('setting_backup_part_import_list_tip_unzip'))
  void importPlaylistFile(path).catch((error: Error) => {
    log.error(error)
    toast(`${global.i18n.t('setting_backup_part_import_list_tip_error')}: ${error.message}`, 'long')
  })
}

export const handleExportList = (path: string) => {
  toast(global.i18n.t('setting_backup_part_export_list_tip_zip'))
  void getAllListsForBackup().then(async data => {
    await handleSaveFile(path + '/lx_list.slxmc', { type: 'playList_v2', data })
    toast(global.i18n.t('setting_backup_part_export_list_tip_success'))
  }).catch((error: Error) => {
    log.error(error)
    toast(`${global.i18n.t('setting_backup_part_export_list_tip_failed')}: ${error.message}`, 'long')
  })
}
