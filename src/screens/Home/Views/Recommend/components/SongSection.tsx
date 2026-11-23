import { memo } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { LIST_IDS } from '@/config/constant'
import { addListMusics, setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import settingState from '@/store/setting/state'
import { useI18n } from '@/lang'

interface Props {
  id: string
  title: string
  list: LX.Music.MusicInfo[]
  onRefresh?: () => void
  onViewAll?: () => void
}

const SongItem = memo(({ item, index, listId, list }: {
  item: LX.Music.MusicInfo
  index: number
  listId: string
  list: LX.Music.MusicInfo[]
}) => {
  const theme = useTheme()
  const handlePlay = async() => {
    await setTempList(listId, list)
    await playList(LIST_IDS.TEMP, index)
  }
  return (
    <TouchableOpacity style={styles.song} onPress={() => { void handlePlay() }}>
      <Image url={item.meta.picUrl} style={styles.songCover} />
      <View style={styles.songTexts}>
        <Text size={13} numberOfLines={1}>{item.name}</Text>
        <Text size={11} numberOfLines={1} color={theme['c-font-label']}>{item.singer}</Text>
      </View>
      {item.meta.recommendTag ? <Text size={10} color={theme['c-font-label']} numberOfLines={1} style={styles.tag}>{item.meta.recommendTag}</Text> : null}
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => {
          void addListMusics(LIST_IDS.LOVE, [item], settingState.setting['list.addMusicLocationType']).catch(err => { console.log(err) })
        }}
      >
        <Icon name="love" size={16} color={theme['c-font-label']} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
})

export default memo(({ id, title, list, onRefresh, onViewAll }: Props) => {
  const theme = useTheme()
  const t = useI18n()
  if (!list.length && !onViewAll) return null
  const listId = `recommend_${id}`
  const playAll = async() => {
    await setTempList(listId, list)
    await playList(LIST_IDS.TEMP, 0)
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text size={16} style={styles.title}>{title}</Text>
        <View style={styles.actions}>
          {onViewAll ? <TouchableOpacity onPress={onViewAll} style={{ minHeight: 44, justifyContent: 'center' }}><Text size={12} color={theme['c-font-label']}>{t('phase1_view_all')}</Text></TouchableOpacity> : null}
          {onRefresh
            ? <TouchableOpacity style={styles.headerBtn} onPress={onRefresh}>
                <Icon name="available_updates" size={15} color={theme['c-font-label']} />
              </TouchableOpacity>
            : null}
          <TouchableOpacity style={styles.headerBtn} onPress={() => { void playAll() }}>
            <Icon name="play" size={15} color={theme['c-font-label']} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ ...styles.songList, borderColor: theme['c-border-background'] }}>
        {list.slice(0, 8).map((item, index) => (
          <SongItem key={item.id} item={item} index={index} listId={listId} list={list} />
        ))}
      </View>
    </View>
  )
})

const styles = createStyle({
  section: {
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  header: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
  },
  headerBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  songList: {
    borderTopWidth: 1,
  },
  song: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
  },
  songCover: {
    width: 42,
    height: 42,
    borderRadius: 5,
  },
  songTexts: {
    flex: 1,
    paddingHorizontal: 10,
  },
  tag: {
    maxWidth: 82,
  },
  iconBtn: {
    width: 38,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
