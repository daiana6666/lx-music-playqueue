import { memo } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import commonState from '@/store/common/state'
import { navigations } from '@/navigation'

interface Props {
  title: string
  list: LX.Netease.HomeChart[]
}

const ChartItem = memo(({ item }: { item: LX.Netease.HomeChart }) => {
  const theme = useTheme()
  return (
    <TouchableOpacity
      style={{ ...styles.card, borderColor: theme['c-border-background'] }}
      onPress={() => {
        if (!commonState.componentIds.home) return
        navigations.pushSonglistDetailScreen(commonState.componentIds.home, {
          id: item.id,
          source: 'wy',
          name: item.name,
          author: '',
          img: item.img,
          desc: item.desc ?? '',
          play_count: item.play_count,
        })
      }}
    >
      <Image url={item.img} style={styles.cover} />
      <View style={styles.texts}>
        <Text size={13} numberOfLines={1} style={styles.name}>{item.name}</Text>
        {item.songs.slice(0, 3).map((song, index) => (
          <Text key={`${item.id}_${index}`} size={10} numberOfLines={1} color={theme['c-font-label']}>
            {index + 1}. {song.name} - {song.singer}
          </Text>
        ))}
      </View>
    </TouchableOpacity>
  )
})

export default memo(({ title, list }: Props) => {
  if (!list.length) return null
  return (
    <View style={styles.section}>
      <Text size={16} style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        data={list}
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <ChartItem item={item} />}
      />
    </View>
  )
})

const styles = createStyle({
  section: {
    paddingBottom: 18,
  },
  title: {
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  list: {
    paddingHorizontal: 12,
    gap: 10,
  },
  card: {
    width: 220,
    minHeight: 92,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    flexDirection: 'row',
  },
  cover: {
    width: 74,
    height: 74,
    borderRadius: 6,
  },
  texts: {
    flex: 1,
    paddingLeft: 9,
    justifyContent: 'center',
  },
  name: {
    fontWeight: '700',
    marginBottom: 4,
  },
})
