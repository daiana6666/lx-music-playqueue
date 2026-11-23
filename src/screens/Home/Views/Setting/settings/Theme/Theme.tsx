import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, TouchableOpacity, type ImageSourcePropType } from 'react-native'
import { setTheme } from '@/core/theme'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'

import SubTitle from '../../components/SubTitle'
import { BG_IMAGES, getAllThemes, saveTheme, type LocalTheme } from '@/theme/themes'
import Text from '@/components/common/Text'
import { createStyle, toast } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'
import { Icon } from '@/components/common/Icon'
import ImageBackground from '@/components/common/ImageBackground'
import FileSelect, { type FileSelectType } from '@/components/common/FileSelect'
import { copyFile, extname, mkdir } from '@/utils/fs'

const CUSTOM_LOCAL_BG_THEME_ID = 'custom_local_bg'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CUSTOM_LOCAL_BG_THEME_NAME = '本地背景'
const IMAGE_EXTS = ['jpg', 'jpeg', 'png']
const LOCAL_BG_DISPLAY_NAME = '\u672c\u5730\u80cc\u666f'
const LOCAL_BG_UPLOAD_TITLE = '\u4e0a\u4f20\u672c\u5730\u56fe\u7247'
const LOCAL_BG_UPLOAD_DESC = '\u9009\u62e9 JPG/PNG \u4f5c\u4e3a App \u80cc\u666f'
const LOCAL_BG_SELECT_TITLE = '\u9009\u62e9\u672c\u5730\u80cc\u666f\u56fe\u7247'
const LOCAL_BG_SUCCESS = '\u5df2\u5e94\u7528\u672c\u5730\u80cc\u666f'
const LOCAL_BG_FAILED = '\u8bbe\u7f6e\u672c\u5730\u80cc\u666f\u5931\u8d25'
const NETEASE_RED = '#d33a31'
const protocolRxp = /^(?:https?:|file:|content:)\/\//

const getCustomThemeImage = (theme: LX.Theme, dataPath: string): ImageSourcePropType | undefined => {
  const bgImage = theme.config.extInfo['bg-image']
  if (!bgImage) return
  if (protocolRxp.test(bgImage)) return { uri: bgImage }
  if (bgImage.startsWith('/')) return { uri: `file://${bgImage}` }
  return { uri: `file://${dataPath}/${bgImage}` }
}

const createLocalBgTheme = (baseTheme: LocalTheme | LX.Theme, bgFileName: string): LX.Theme => {
  const isDark = baseTheme.isDark
  return {
    id: CUSTOM_LOCAL_BG_THEME_ID,
    name: LOCAL_BG_DISPLAY_NAME,
    isDark,
    isCustom: true,
    config: {
      themeColors: { ...baseTheme.config.themeColors },
      extInfo: {
        ...baseTheme.config.extInfo,
        'c-app-background': isDark ? 'rgba(0, 0, 0, 0)' : 'rgba(255, 255, 255, 0)',
        'c-main-background': isDark ? 'rgba(0, 0, 0, 0.78)' : 'rgba(255, 255, 255, 0.82)',
        'bg-image': bgFileName,
        'bg-image-position': 'center',
        'bg-image-size': 'cover',
      },
    },
  }
}

const useActive = (id: string) => {
  const activeThemeId = useSettingValue('theme.id')
  const isActive = useMemo(() => activeThemeId == id, [activeThemeId, id])
  return isActive
}

const ThemeItem = ({ id, name, color, image, setTheme, showAll }: {
  id: string
  name: string
  color: string
  showAll: boolean
  image?: ImageSourcePropType
  setTheme: (id: string) => void
}) => {
  const theme = useTheme()
  const isActive = useActive(id)

  return (
    showAll || isActive ? (
      <TouchableOpacity
        style={{
          ...styles.item,
          width: scaleSizeH(ITEM_HEIGHT),
          borderColor: isActive ? NETEASE_RED : theme['c-border-background'],
          backgroundColor: isActive ? 'rgba(211, 58, 49, 0.08)' : theme['c-main-background'],
        }}
        activeOpacity={0.72}
        onPress={() => { setTheme(id) }}>
        <View style={{ ...styles.colorContent, width: scaleSizeH(COLOR_ITEM_HEIGHT), borderColor: isActive ? NETEASE_RED : 'transparent' }}>
          {
            image
              ? <ImageBackground style={{ ...styles.imageContent, width: scaleSizeH(IMAGE_HEIGHT), backgroundColor: color }}
                  imageStyle={{ borderRadius: 8 }}
                  source={image} />
              : <View style={{ ...styles.imageContent, width: scaleSizeH(IMAGE_HEIGHT), backgroundColor: color }}></View>
            }
        </View>
        <Text style={styles.name} size={12} color={isActive ? NETEASE_RED : theme['c-font']} numberOfLines={1}>{name}</Text>
      </TouchableOpacity>
    ) : null
  )
}

const MoreBtn = ({ showAll, setShowAll }: {
  showAll: boolean
  setShowAll: (showAll: boolean) => void
}) => {
  const t = useI18n()

  return (
    showAll ? null
      : (
          <TouchableOpacity style={styles.moreBtn} activeOpacity={0.72} onPress={() => { setShowAll(!showAll) }}>
            <Text size={14} color={NETEASE_RED} numberOfLines={1}>{t('setting_basic_theme_more_btn_show')}</Text>
            <Icon name="chevron-right" size={12} color={NETEASE_RED} />
          </TouchableOpacity>
        )

  )
}

const LocalBgBtn = ({ onPress }: {
  onPress: () => void
}) => {
  const theme = useTheme()

  return (
    <TouchableOpacity
      style={{
        ...styles.localBgCard,
        borderColor: 'rgba(211, 58, 49, 0.28)',
        backgroundColor: theme.isDark ? 'rgba(211, 58, 49, 0.12)' : 'rgba(211, 58, 49, 0.08)',
      }}
      activeOpacity={0.76}
      onPress={onPress}>
      <View style={styles.localBgBadge}>
        <Text size={24} color="#fff">+</Text>
      </View>
      <View style={styles.localBgCopy}>
        <Text size={15} color={theme['c-font']} numberOfLines={1}>{LOCAL_BG_UPLOAD_TITLE}</Text>
        <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{LOCAL_BG_UPLOAD_DESC}</Text>
      </View>
      <Icon name="chevron-right" size={13} color={NETEASE_RED} />
    </TouchableOpacity>
  )
}

interface ThemeInfo {
  themes: Readonly<LocalTheme[]>
  userThemes: LX.Theme[]
  dataPath: string
}
const initInfo: ThemeInfo = { themes: [], userThemes: [], dataPath: '' }
export default memo(() => {
  const [showAll, setShowAll] = useState(false)
  const t = useI18n()
  const activeThemeId = useSettingValue('theme.id')
  const [themeInfo, setThemeInfo] = useState(initInfo)
  const fileSelectRef = useRef<FileSelectType>(null)
  const setThemeId = useCallback((id: string) => {
    requestAnimationFrame(() => {
      setTheme(id)
    })
  }, [])

  const handleSelectLocalBg = useCallback((path: string) => {
    void (async() => {
      const baseTheme = themeInfo.themes.find(theme => theme.id == activeThemeId) ??
        themeInfo.userThemes.find(theme => theme.id == activeThemeId) ??
        themeInfo.themes[0]
      if (!baseTheme) return

      const ext = extname(path).toLowerCase()
      const imageExt = IMAGE_EXTS.includes(ext) ? ext : 'jpg'
      const bgFileName = `${CUSTOM_LOCAL_BG_THEME_ID}_${Date.now()}.${imageExt}`
      const targetPath = `${themeInfo.dataPath}/${bgFileName}`

      await mkdir(themeInfo.dataPath).catch(() => undefined)
      await copyFile(path, targetPath)

      const localBgTheme = createLocalBgTheme(baseTheme, bgFileName)
      await saveTheme(localBgTheme)
      setThemeInfo(info => ({
        ...info,
        userThemes: [
          ...info.userThemes.filter(theme => theme.id != CUSTOM_LOCAL_BG_THEME_ID),
          localBgTheme,
        ],
      }))
      setThemeId(CUSTOM_LOCAL_BG_THEME_ID)
      toast(LOCAL_BG_SUCCESS)
      /*
      toast('已应用本地背景')
      */
    })().catch(() => {
      toast(LOCAL_BG_FAILED, 'long')
      /*
      toast('设置本地背景失败', 'long')
      */
    })
  }, [activeThemeId, setThemeId, themeInfo])

  const handleShowLocalBgSelector = useCallback(() => {
    fileSelectRef.current?.show({
      title: LOCAL_BG_SELECT_TITLE,
      dirOnly: false,
      filter: IMAGE_EXTS,
    }, handleSelectLocalBg)
    /*
    fileSelectRef.current?.show({
      title: '选择本地背景图片',
      title: LOCAL_BG_SELECT_TITLE,
      dirOnly: false,
      filter: IMAGE_EXTS,
    }, handleSelectLocalBg)
    */
  }, [handleSelectLocalBg])

  useEffect(() => {
    void getAllThemes().then(setThemeInfo)
  }, [])

  return (
    <SubTitle title={t('setting_basic_theme')}>
      <LocalBgBtn onPress={handleShowLocalBgSelector} />
      <View style={styles.list}>
        {
          themeInfo.themes.map(({ id, config }) => {
            return <ThemeItem
              key={id}
              color={config.themeColors['c-theme']}
              image={config.extInfo['bg-image'] ? BG_IMAGES[config.extInfo['bg-image']] : undefined}
              showAll={showAll}
              id={id}
              name={t(`theme_${id}`)}
              setTheme={setThemeId} />
          })
        }
        {
          themeInfo.userThemes.map((userTheme) => {
            return <ThemeItem
              key={userTheme.id}
              color={userTheme.config.themeColors['c-theme']}
              image={getCustomThemeImage(userTheme, themeInfo.dataPath)}
              showAll={showAll}
              id={userTheme.id}
              name={userTheme.name}
              setTheme={setThemeId} />
          })
        }
        <MoreBtn showAll={showAll} setShowAll={setShowAll} />
      </View>
      <FileSelect ref={fileSelectRef} />
    </SubTitle>
  )
})

const ITEM_HEIGHT = 62
const COLOR_ITEM_HEIGHT = 36
const IMAGE_HEIGHT = 29
const styles = createStyle({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  item: {
    // marginRight: 15,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 7,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 1,
    // marginTop: 5,
    // backgroundColor: 'rgba(0,0,0,0.2)',
  },
  colorContent: {
    height: COLOR_ITEM_HEIGHT,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor: 'rgba(0,0,0,0.2)',
  },
  imageContent: {
    height: IMAGE_HEIGHT,
    borderRadius: 8,
    // elevation: 1,
  },
  localBgCard: {
    minHeight: 68,
    marginTop: 4,
    marginRight: 15,
    paddingLeft: 14,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 2,
  },
  localBgBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NETEASE_RED,
  },
  localBgCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 3,
  },
  localBgContent: {
    height: COLOR_ITEM_HEIGHT,
    borderRadius: 4,
    borderWidth: 1.6,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 6,
  },
  moreBtn: {
    marginLeft: 6,
    paddingLeft: 14,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(211, 58, 49, 0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    // justifyContent: 'center',
    gap: 8,
  },
})
