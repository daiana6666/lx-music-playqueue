import { getData } from '@/plugins/storage'
import { Alert } from 'react-native'
// import { getPlayInfo } from '@/utils/data'
// import { log } from '@/utils/log'
import { init as musicSdkInit } from '@/utils/musicSdk'
import { getUserLists, refreshWebDAVList, setUserList } from '@/core/list'
import { setNavActiveId } from '../common'
import { getViewPrevState } from '@/utils/data'
import { bootLog } from '@/utils/bootLog'
import { getDislikeInfo, setDislikeInfo } from '@/core/dislikeList'
import { unlink } from '@/utils/fs'
import { TEMP_FILE_PATH } from '@/utils/tools'
import { initNeteaseAccount } from '@/store/netease/action'
import { initRecentPlayList } from '@/store/recentPlay/action'
import { initListeningTimeStats } from '@/store/listeningTime/action'
// import { play, playList } from '../player/player'

// const initPrevPlayInfo = async(appSetting: LX.AppSetting) => {
//   const info = await getPlayInfo()
//   global.lx.restorePlayInfo = null
//   if (!info?.listId || info.index < 0) return
//   const list = await getListMusics(info.listId)
//   if (!list[info.index]) return
//   global.lx.restorePlayInfo = info
//   await playList(info.listId, info.index)

//   if (appSetting['player.startupAutoPlay']) setTimeout(play)
// }

export default async(appSetting: LX.AppSetting) => {
  // await Promise.all([
  //   initUserApi(), // 自定义API
  // ]).catch(err => log.error(err))
  void musicSdkInit() // 初始化音乐sdk
  bootLog('User list init...')
  setUserList(await getUserLists()) // 获取用户列表
  setDislikeInfo(await getDislikeInfo()) // 获取不喜欢列表
  bootLog('User list inited.')
  if (appSetting['webdav.autoRefresh']) {
    const hasWebDAVConfig = appSetting['webdav.url'] && appSetting['webdav.username'] && appSetting['webdav.password']
    if (hasWebDAVConfig) {
      void refreshWebDAVList().catch(err => {
        console.log(err)
      })
    }
  }
  await getData('@sync_auth_key').catch(() => { Alert.alert('同步需要重新认证', '同步密钥无法从设备安全存储读取，请重新连接并认证。') })
  void initNeteaseAccount().catch(() => { Alert.alert('网易云需要重新登录', '账号凭据无法从设备安全存储读取，请重新登录。') })
  await Promise.all([
    initRecentPlayList().catch(err => { console.log(err) }),
    initListeningTimeStats().catch(err => { console.log(err) }),
  ])
  setNavActiveId((await getViewPrevState()).id)
  void unlink(TEMP_FILE_PATH)
  // await initPrevPlayInfo(appSetting).catch(err => log.error(err)) // 初始化上次的歌曲播放信息
}
