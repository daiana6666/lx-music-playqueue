import { memo, useCallback, useState } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Slider, { type SliderProps } from '../../components/Slider'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { updateSetting } from '@/core/common'

type PlayBarSettingKey = 'playBar.backgroundOpacity' | 'playBar.borderRadius' | 'playBar.marginHorizontal'

export default memo(({ title, settingKey, minimumValue, maximumValue, unit = '' }: {
  title: string
  settingKey: PlayBarSettingKey
  minimumValue: number
  maximumValue: number
  unit?: string
}) => {
  const value = useSettingValue(settingKey)
  const theme = useTheme()
  const [sliderValue, setSliderValue] = useState(value)
  const [isSliding, setSliding] = useState(false)

  const handleSlidingStart = useCallback<NonNullable<SliderProps['onSlidingStart']>>(() => {
    setSliding(true)
  }, [])
  const handleValueChange = useCallback<NonNullable<SliderProps['onValueChange']>>(value => {
    setSliderValue(value)
  }, [])
  const handleSlidingComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(newValue => {
    setSliding(false)
    if (value == newValue) return
    const setting: Partial<LX.AppSetting> = { [settingKey]: newValue }
    updateSetting(setting)
  }, [settingKey, value])

  const displayValue = isSliding ? sliderValue : value

  return (
    <SubTitle title={title}>
      <View style={styles.content}>
        <Text style={{ color: theme['c-primary-font'] }}>{displayValue}{unit}</Text>
        <Slider
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          onSlidingComplete={handleSlidingComplete}
          onValueChange={handleValueChange}
          onSlidingStart={handleSlidingStart}
          step={1}
          value={value}
        />
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  content: {
    flexGrow: 0,
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
})
