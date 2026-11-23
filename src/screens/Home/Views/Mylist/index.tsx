import { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { PlatformPlaylistsEntry } from '../Recommend/components/PlatformHub'
import settingState from '@/store/setting/state'
import MusicList from './MusicList'
import MyList from './MyList'
import { useTheme } from '@/store/theme/hook'
import DrawerLayoutFixed, { type DrawerLayoutFixedType } from '@/components/common/DrawerLayoutFixed'
import { COMPONENT_IDS } from '@/config/constant'
import { scaleSizeW } from '@/utils/pixelRatio'
import commonState, { type InitState as CommonState } from '@/store/common/state'
import { useBackHandler } from '@/utils/hooks/useBackHandler'

const MAX_WIDTH = scaleSizeW(400)

export default () => {
  const drawer = useRef<DrawerLayoutFixedType>(null)
  const theme = useTheme()
  const [showDetail, setShowDetail] = useState(false)
  // const [width, setWidth] = useState(0)

  useBackHandler(useCallback(() => {
    if (commonState.navActiveId != 'nav_love' || !showDetail) return false
    setShowDetail(false)
    return true
  }, [showDetail]))

  useEffect(() => {
    const handleFixDrawer = (id: CommonState['navActiveId']) => {
      if (id == 'nav_love') drawer.current?.fixWidth()
    }
    const changeVisible = (visible: boolean) => {
      if (visible) {
        requestAnimationFrame(() => {
          drawer.current?.openDrawer()
        })
      } else {
        drawer.current?.closeDrawer()
      }
    }

    // setWidth(getWindowSise().width * 0.82)

    global.state_event.on('navActiveIdUpdated', handleFixDrawer)
    global.app_event.on('changeLoveListVisible', changeVisible)

    // 就放旋转屏幕后的宽度没有更新的问题
    // const changeEvent = onDimensionChange(({ window }) => {
    //   setWidth(window.width * 0.82)
    //   drawer.current?.setNativeProps({
    //     width: window.width,
    //   })
    // })

    return () => {
      global.state_event.off('navActiveIdUpdated', handleFixDrawer)
      global.app_event.off('changeLoveListVisible', changeVisible)
    // changeEvent.remove()
    }
  }, [])

  const navigationView = () => <MyList onSelectList={() => { setShowDetail(true) }} />
  // console.log('render drawer content')

  return (
    <DrawerLayoutFixed
      ref={drawer}
      visibleNavNames={[COMPONENT_IDS.home]}
      // drawerWidth={width}
      widthPercentage={0.82}
      widthPercentageMax={MAX_WIDTH}
      drawerPosition={settingState.setting['common.drawerLayoutPosition']}
      renderNavigationView={navigationView}
      drawerBackgroundColor={theme['c-content-background']}
      style={{ elevation: 1 }}
    >
      {
        showDetail
          ? <MusicList onBack={() => { setShowDetail(false) }} />
          : <View style={{ flex: 1 }}><PlatformPlaylistsEntry /><MyList
              alwaysVisible
              variant="overview"
              onSelectList={() => { setShowDetail(true) }}
            /></View>
      }
    </DrawerLayoutFixed>
  )
}
