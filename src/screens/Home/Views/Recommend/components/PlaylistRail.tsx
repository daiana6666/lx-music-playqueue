import { memo } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import commonState from '@/store/common/state'
import { navigations } from '@/navigation'

interface Props {
  title: string
  list: LX.Netease.Playlist[]
  onSettingsPress?: () => void
}

const PlaylistItem = memo(({ item }: { item: LX.Netease.Playlist }) => {
  const theme = useTheme()
  const handlePress = () => {
    if (!commonState.componentIds.home) return
    navigations.pushSonglistDetailScreen(commonState.componentIds.home, {
      ...item,
      desc: item.desc ?? undefined,
    })
  }

  return (
    <TouchableOpacity style={styles.item} onPress={handlePress}>
      <Image url={item.img} style={styles.cover} />
      <Text size={12} numberOfLines={2} style={styles.itemTitle}>{item.name}</Text>
      <Text size={10} numberOfLines={1} color={theme['c-font-label']}>{item.play_count}</Text>
    </TouchableOpacity>
  )
})

export default memo(({ title, list, onSettingsPress }: Props) => {
  const theme = useTheme()
  if (!list.length) return null
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text size={16} style={styles.title}>{title}</Text>
        {onSettingsPress
          ? (
              <TouchableOpacity
                style={{ ...styles.settingsBtn, backgroundColor: theme['c-primary-light-900-alpha-200'] }}
                onPress={onSettingsPress}
              >
                <Icon name="setting" size={15} color={theme['c-primary-font']} />
              </TouchableOpacity>
            )
          : null}
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={list}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <PlaylistItem item={item} />}
      />
    </View>
  )
})

const styles = createStyle({
  section: {
    paddingBottom: 14,
  },
  header: {
    minHeight: 34,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontWeight: '700',
  },
  settingsBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  list: {
    paddingHorizontal: 12,
    gap: 10,
  },
  item: {
    width: 104,
  },
  cover: {
    width: 104,
    height: 104,
    borderRadius: 6,
  },
  itemTitle: {
    paddingTop: 6,
    minHeight: 38,
  },
})
