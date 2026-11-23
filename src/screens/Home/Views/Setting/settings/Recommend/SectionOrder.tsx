import { memo } from 'react'
import { View } from 'react-native'
import Text from '@/components/common/Text'
import Button from '../../components/Button'
import { useI18n } from '@/lang'
import type { Message } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { moveRecommendHomeSection, normalizeRecommendHomeSectionOrder } from '@/core/netease/helpers'
import { RECOMMEND_HOME_SECTION_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'

const sectionNameKey: Record<LX.RecommendHomeSectionId, keyof Message> = {
  radarPlaylists: 'recommend_radar',
  styleSongs: 'recommend_style_songs',
  dailySongCategories: 'recommend_daily_categories',
  similarSongs: 'recommend_similar_songs',
  recommendPlaylists: 'recommend_playlists',
  charts: 'recommend_charts',
}

export default memo(() => {
  const t = useI18n()
  const order = normalizeRecommendHomeSectionOrder(useSettingValue('recommend.homeSectionOrder')) as LX.RecommendHomeSectionId[]
  const move = (section: LX.RecommendHomeSectionId, direction: number) => {
    updateSetting({ 'recommend.homeSectionOrder': moveRecommendHomeSection(order, section, direction) })
  }

  return (
    <View>
      <View style={styles.toolbar}>
        <Button onPress={() => { updateSetting({ 'recommend.homeSectionOrder': [...RECOMMEND_HOME_SECTION_IDS] }) }}>{t('recommend_reset')}</Button>
      </View>
      {order.map(section => (
        <View key={section} style={styles.row}>
          <Text style={styles.name}>{t(sectionNameKey[section])}</Text>
          <Button onPress={() => { move(section, -1) }}>{t('recommend_move_up')}</Button>
          <Button onPress={() => { move(section, 1) }}>{t('recommend_move_down')}</Button>
        </View>
      ))}
    </View>
  )
})

const styles = createStyle({
  toolbar: {
    flexDirection: 'row',
    paddingLeft: 12,
    paddingBottom: 4,
  },
  row: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
  },
  name: {
    flex: 1,
  },
})
