import { setMusicInfo } from '@/core/player/playInfo'
import { playbackCoordinator } from '@/core/music/playbackSession'
import { getUserApiList } from '@/utils/data'
import { setUserApiList } from '@/core/userApi'
import { initSourceRuntime } from '@/core/sourceRuntime'

export default async(setting: LX.AppSetting) => {
  initSourceRuntime()
  global.state_event.on('apiSourceUpdated', () => { playbackCoordinator.invalidate(); setMusicInfo({ quality: null, qualityVerified: false }) })
  global.state_event.on('configUpdated', keys => {
    if (keys.some(key => ['player.fallbackSources', 'player.disabledFallbackSources', 'common.apiSource'].includes(key))) playbackCoordinator.invalidate()
  })
  setUserApiList(await getUserApiList())
}
