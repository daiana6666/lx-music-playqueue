import { memo, useMemo } from 'react'
import { View } from 'react-native'
import { useKeyboard } from '@/utils/hooks'

import Pic from './components/Pic'
import Title from './components/Title'
import PlayInfo from './components/PlayInfo'
import ControlBtn from './components/ControlBtn'
import { createStyle } from '@/utils/tools'
// import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'


const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100)

const toAlphaColor = (color: string, opacity: number) => {
  const alpha = clampPercent(opacity) / 100
  const rgbMatch = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  if (rgbMatch) return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`

  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)
  if (!hexMatch) return color

  const hex = hexMatch[1].length == 3
    ? hexMatch[1].split('').map(s => s + s).join('')
    : hexMatch[1]
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}


export default memo(({ isHome = false }: { isHome?: boolean }) => {
  // const { onLayout, ...layout } = useLayout()
  const { keyboardShown } = useKeyboard()
  const theme = useTheme()
  const autoHidePlayBar = useSettingValue('common.autoHidePlayBar')
  const backgroundOpacity = useSettingValue('playBar.backgroundOpacity')
  const borderRadius = useSettingValue('playBar.borderRadius')
  const marginHorizontal = useSettingValue('playBar.marginHorizontal')

  const playerComponent = useMemo(() => (
    <View style={{
      ...styles.wrapper,
      paddingHorizontal: `${Math.min(Math.max(marginHorizontal, 0), 20)}%`,
    }}>
      <View style={{
        ...styles.container,
        backgroundColor: toAlphaColor(theme['c-content-background'], backgroundOpacity),
        borderRadius: Math.max(borderRadius, 0),
      }}>
        <Pic isHome={isHome} />
        <View style={styles.center}>
          <Title isHome={isHome} />
          {/* <View style={{ ...styles.row, justifyContent: 'space-between' }}>
            <PlayTime />
          </View> */}
          <PlayInfo isHome={isHome} />
        </View>
        <View style={styles.right}>
          <ControlBtn />
        </View>
      </View>
    </View>
  ), [backgroundOpacity, borderRadius, isHome, marginHorizontal, theme])

  // console.log('render pb')

  return autoHidePlayBar && keyboardShown ? null : playerComponent
})


const styles = createStyle({
  wrapper: {
    width: '100%',
    paddingTop: 4,
    paddingBottom: 6,
  },
  container: {
    // height: 100,
    // paddingTop: progressContentPadding,
    // marginTop: -progressContentPadding,
    // backgroundColor: 'rgba(0, 0, 0, .1)',
    // borderTopWidth: BorderWidths.normal2,
    paddingVertical: 5,
    paddingLeft: 5,
    // backgroundColor: AppColors.primary,
    // backgroundColor: 'red',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  left: {
    // borderRadius: 3,
    flexGrow: 0,
    flexShrink: 0,
  },
  center: {
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 5,
    height: '100%',
    // justifyContent: 'space-evenly',
    // height: 48,
    // backgroundColor: 'rgba(0, 0, 0, .1)',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 0,
    flexShrink: 0,
    paddingLeft: 5,
    paddingRight: 5,
  },
  // row: {
  //   flexDirection: 'row',
  //   flexGrow: 0,
  //   flexShrink: 0,
  // },
})
