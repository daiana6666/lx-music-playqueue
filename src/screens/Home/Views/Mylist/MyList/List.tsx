import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, TouchableOpacity, FlatList, type NativeScrollEvent, type NativeSyntheticEvent, type FlatListProps } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Image from '@/components/common/Image'

import { useTheme } from '@/store/theme/hook'
import { useActiveListId, useListFetching, useMyList } from '@/store/list/hook'
import { createStyle, toast } from '@/utils/tools'
import { useListProfiles, setGroupCollapsed } from '@/core/listProfile'
import { resolveGroup } from '@/core/listProfile/helpers'
import { LIST_IDS, LIST_SCROLL_POSITION_KEY } from '@/config/constant'
import { getListPosition, saveListPosition } from '@/utils/data'
import { getListMusics, setActiveList } from '@/core/list'
import Text from '@/components/common/Text'
import { type Position } from './ListMenu'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import Loading from '@/components/common/Loading'
import { BorderRadius } from '@/theme'

interface GroupRow { id: string, group: LX.List.UserListGroup, count: number }
type FlatListType = FlatListProps<LX.List.MyListInfo | GroupRow>
type ListVariant = 'drawer' | 'overview'

const DRAWER_ITEM_HEIGHT = scaleSizeH(40)
const OVERVIEW_ITEM_HEIGHT = scaleSizeH(82)
const COVER_SIZE = scaleSizeW(58)

const ListItem = memo(({ item, index, activeId, variant, profile, onPress, onShowMenu }: {
  onPress: (item: LX.List.MyListInfo) => void
  index: number
  activeId: string
  item: LX.List.MyListInfo
  variant: ListVariant
  profile?: LX.List.UserListProfile
  onShowMenu: (item: LX.List.MyListInfo, index: number, position: { x: number, y: number, w: number, h: number }) => void
}) => {
  const theme = useTheme()
  const moreButtonRef = useRef<TouchableOpacity>(null)
  const fetching = useListFetching(item.id)
  const [summary, setSummary] = useState({ count: 0, picUrl: null as string | null })

  const active = activeId == item.id

  useEffect(() => {
    let mounted = true
    const updateSummary = () => {
      void getListMusics(item.id).then((list) => {
        if (!mounted) return
        setSummary({
          count: list.length,
          picUrl: list[0]?.meta.picUrl ?? null,
        })
      })
    }
    const handleMusicUpdate = (ids: string[]) => {
      if (ids.includes(item.id)) updateSummary()
    }

    updateSummary()
    global.app_event.on('myListMusicUpdate', handleMusicUpdate)
    return () => {
      mounted = false
      global.app_event.off('myListMusicUpdate', handleMusicUpdate)
    }
  }, [item.id])

  const handleShowMenu = () => {
    if (moreButtonRef.current?.measure) {
      moreButtonRef.current.measure((fx, fy, width, height, px, py) => {
        // console.log(fx, fy, width, height, px, py)
        onShowMenu(item, index, { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) })
      })
    }
  }

  const handlePress = () => {
    onPress(item)
  }

  return variant == 'overview'
    ? (
        <View style={{ ...styles.overviewItem, height: OVERVIEW_ITEM_HEIGHT, backgroundColor: active ? theme['c-primary-background'] : 'transparent' }}>
          <TouchableOpacity style={styles.overviewMain} onPress={handlePress}>
            <Image style={styles.cover} url={profile?.coverUrl ? profile.coverUrl : summary.picUrl} />
            <View style={styles.overviewInfo}>
              <Text numberOfLines={1} size={16} color={active ? theme['c-primary-font'] : theme['c-font']}>{item.name}</Text>
              <View style={styles.overviewMeta}>
                { fetching ? <Loading color={active ? theme['c-primary-font'] : theme['c-font']} style={styles.overviewLoading} /> : null }
                <Text numberOfLines={1} size={12} color={theme['c-font-label']}>
                  {profile?.description ? profile.description : `${global.i18n.t('nav_songlist')} - ${summary.count}`}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShowMenu} ref={moreButtonRef} style={styles.overviewMoreBtn}>
            <Icon name="dots-vertical" color={theme['c-350']} size={13} />
          </TouchableOpacity>
        </View>
      )
    : (
        <View style={{ ...styles.listItem, height: DRAWER_ITEM_HEIGHT }}>
          {
            active
              ? <Icon style={styles.listActiveIcon} name="chevron-right" size={12} color={theme['c-primary-font']} />
              : null
          }
          { fetching ? <Loading color={active ? theme['c-primary-font'] : theme['c-font']} style={styles.loading} /> : null }
          <TouchableOpacity style={styles.listName} onPress={handlePress}>
            <Text numberOfLines={1} color={active ? theme['c-primary-font'] : theme['c-font']}>{item.name}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShowMenu} ref={moreButtonRef} style={styles.listMoreBtn}>
            <Icon name="dots-vertical" color={theme['c-350']} size={12} />
          </TouchableOpacity>
        </View>
      )
}, (prevProps, nextProps) => {
  return !!(prevProps.item === nextProps.item &&
    prevProps.index === nextProps.index &&
    prevProps.variant === nextProps.variant &&
    prevProps.profile === nextProps.profile &&
    prevProps.item.name == nextProps.item.name &&
    prevProps.activeId != nextProps.item.id &&
    nextProps.activeId != nextProps.item.id
  )
})


export default ({ onShowMenu, variant = 'drawer', onSelectList }: {
  onShowMenu: (info: { listInfo: LX.List.MyListInfo, index: number }, position: Position) => void
  variant?: ListVariant
  onSelectList?: (info: LX.List.MyListInfo) => void
}) => {
  const flatListRef = useRef<FlatList>(null)
  const allList = useMyList()
  const { profiles, collapsed } = useListProfiles()
  const visibleList = useMemo(() => {
    const rows: Array<LX.List.MyListInfo | GroupRow> = allList.filter(item => item.id == LIST_IDS.LOVE || item.id == LIST_IDS.WEBDAV)
    const builtInIds: string[] = [LIST_IDS.DEFAULT, LIST_IDS.LOVE, LIST_IDS.WEBDAV]
    const userLists = allList.filter(item => !builtInIds.includes(item.id)) as LX.List.UserListInfo[]
    for (const group of ['mine', 'external'] as const) {
      const lists = userLists.filter(list => resolveGroup(list, profiles[list.id]) == group)
      rows.push({ id: `__group_${group}`, group, count: lists.length })
      if (!collapsed[group]) rows.push(...lists)
    }
    return rows
  }, [allList, profiles, collapsed])
  const originalIndexById = useMemo(() => new Map(allList.map((item, index) => [item.id, index])), [allList])
  const activeListId = useActiveListId()
  const itemHeight = variant == 'overview' ? OVERVIEW_ITEM_HEIGHT : DRAWER_ITEM_HEIGHT

  const handleToggleList = (item: LX.List.MyListInfo) => {
    // setVisiblePanel(false)
    global.app_event.changeLoveListVisible(false)
    requestAnimationFrame(() => {
      setActiveList(item.id)
      onSelectList?.(item)
    })
  }


  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    void saveListPosition(LIST_SCROLL_POSITION_KEY, nativeEvent.contentOffset.y)
  }

  const showMenu = (listInfo: LX.List.MyListInfo, index: number, position: Position) => {
    onShowMenu({ listInfo, index }, position)
  }

  useEffect(() => {
    void getListPosition(LIST_SCROLL_POSITION_KEY).then((offset) => {
      flatListRef.current?.scrollToOffset({ offset, animated: false })
    })
  }, [])

  const renderItem: FlatListType['renderItem'] = ({ item, index }) => 'group' in item ? (
    <TouchableOpacity style={{ height: scaleSizeH(38), justifyContent: 'center', paddingHorizontal: 16 }} onPress={() => {
      void setGroupCollapsed(item.group, !collapsed[item.group]).catch(error => { toast(String(error.message ?? error)) })
    }} accessibilityRole="button" accessibilityState={{ expanded: !collapsed[item.group] }}>
      <Text size={13}>{collapsed[item.group] ? '▸' : '▾'} {global.i18n.t(item.group == 'mine' ? 'phase1_group_mine' : 'phase1_group_external')} · {item.count}</Text>
    </TouchableOpacity>
  ) : (
    <ListItem
      key={item.id}
      item={item}
      index={originalIndexById.get(item.id) ?? index}
      activeId={activeListId}
      variant={variant}
      profile={profiles[item.id]}
      onPress={handleToggleList}
      onShowMenu={showMenu}
    />
  )
  const getkey: FlatListType['keyExtractor'] = item => item.id
  const getItemLayout: FlatListType['getItemLayout'] = (data, index) => {
    const rowHeight = (row: LX.List.MyListInfo | GroupRow) => 'group' in row ? scaleSizeH(38) : itemHeight
    return { length: rowHeight(visibleList[index]), offset: visibleList.slice(0, index).reduce((offset, row) => offset + rowHeight(row), 0), index }
  }

  return (
    <FlatList
      ref={flatListRef}
      onScroll={handleScroll}
      style={variant == 'overview' ? styles.overviewContainer : styles.container}
      contentContainerStyle={variant == 'overview' ? styles.overviewContent : undefined}
      data={visibleList}
      maxToRenderPerBatch={9}
      // updateCellsBatchingPeriod={80}
      windowSize={9}
      removeClippedSubviews={true}
      initialNumToRender={18}
      renderItem={renderItem}
      keyExtractor={getkey}
      // extraData={activeIndex}
      getItemLayout={getItemLayout}
    />
  )
}


const styles = createStyle({
  container: {
    flexShrink: 1,
    flexGrow: 0,
  },
  overviewContainer: {
    flex: 1,
  },
  overviewContent: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  // listContainer: {
  //   // borderBottomWidth: BorderWidths.normal2,
  // },

  listItem: {
    height: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 5,
    paddingLeft: 5,
    // borderBottomWidth: BorderWidths.normal,
  },
  listActiveIcon: {
    // width: 18,
    marginLeft: 3,
    // paddingRight: 5,
    textAlign: 'center',
  },
  loading: {
    marginLeft: 5,
  },
  listName: {
    height: '100%',
    // height: 46,
    // paddingTop: 12,
    // paddingBottom: 12,
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 5,
    // backgroundColor: 'rgba(0,0,0,0.1)',
  },
  // listNameText: {
  //   // height: 46,
  //   fontSize: 14,
  // },
  listMoreBtn: {
    height: '100%',
    width: 36,
    // height: 46,
    // paddingTop: 12,
    // paddingBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor: 'rgba(0,0,0,0.1)',
  },
  overviewItem: {
    marginLeft: 8,
    marginRight: 8,
    paddingLeft: 8,
    paddingRight: 2,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewMain: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: BorderRadius.normal,
  },
  overviewInfo: {
    flex: 1,
    paddingLeft: 12,
    paddingRight: 8,
  },
  overviewMeta: {
    paddingTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewLoading: {
    marginRight: 6,
  },
  overviewMoreBtn: {
    height: '100%',
    width: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
})

