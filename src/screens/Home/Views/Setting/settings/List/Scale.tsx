import { memo } from 'react'
import { View } from 'react-native'
import Text from '@/components/common/Text'
import Slider from '../../components/Slider'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'

export default memo(() => {
  const t = useI18n()
  const sidebarScale = useSettingValue('list.myListSidebarScale')
  const profileScale = useSettingValue('list.playlistProfileScale')

  return (
    <View style={styles.container}>
      <Text>{t('list_sidebar_scale')}: {sidebarScale}%</Text>
      <Slider
        value={sidebarScale}
        minimumValue={80}
        maximumValue={140}
        step={5}
        onSlidingComplete={value => { updateSetting({ 'list.myListSidebarScale': value }) }}
      />
      <Text>{t('list_playlist_profile_scale')}: {profileScale}%</Text>
      <Slider
        value={profileScale}
        minimumValue={80}
        maximumValue={140}
        step={5}
        onSlidingComplete={value => { updateSetting({ 'list.playlistProfileScale': value }) }}
      />
    </View>
  )
})

const styles = createStyle({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
})
