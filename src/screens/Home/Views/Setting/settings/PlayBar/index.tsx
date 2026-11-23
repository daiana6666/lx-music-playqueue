import { memo } from 'react'

import Section from '../../components/Section'
import { useI18n } from '@/lang'
import SliderItem from './SliderItem'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_play_bar')}>
      <SliderItem
        title={t('setting_play_bar_bg_opacity')}
        settingKey="playBar.backgroundOpacity"
        minimumValue={0}
        maximumValue={100}
        unit="%"
      />
      <SliderItem
        title={t('setting_play_bar_border_radius')}
        settingKey="playBar.borderRadius"
        minimumValue={0}
        maximumValue={40}
      />
      <SliderItem
        title={t('setting_play_bar_margin_horizontal')}
        settingKey="playBar.marginHorizontal"
        minimumValue={0}
        maximumValue={20}
        unit="%"
      />
    </Section>
  )
})
