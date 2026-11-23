import { useEffect, useRef, useState } from 'react'
import { FlatList, Modal, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import TrackArtwork from '@/components/TrackArtwork'
import MusicAddModal, { type MusicAddModalType } from '@/components/MusicAddModal'
import { useTheme } from '@/store/theme/hook'
import { useRecentPlayList } from '@/store/recentPlay/hook'
import recentState from '@/store/recentPlay/state'
import { useI18n } from '@/lang'
import { getListPosition, saveListPosition } from '@/utils/data'
import { createStyle, toast } from '@/utils/tools'
import { playMusicInfo } from '@/core/player/player'
import { createPlayerMusicIdentity } from '@/core/player/helpers'
import { isPlayableRecord } from '@/core/player/queue'

const POSITION_KEY = '__recent_play_page__'

export default ({ visible, onClose }: { visible: boolean, onClose: () => void }) => {
  const t = useI18n()
  const theme = useTheme()
  const list = useRecentPlayList()
  const listRef = useRef<FlatList<LX.Music.MusicInfo>>(null)
  const addRef = useRef<MusicAddModalType>(null)
  const restored = useRef(false)
  const touched = useRef(false)
  const contentReady = useRef(false)
  const [offset, setOffset] = useState<number | null>(null)

  useEffect(() => {
    if (!visible) return
    let active = true
    restored.current = false
    touched.current = false
    contentReady.current = false
    setOffset(null)
    void getListPosition(POSITION_KEY).then(value => {
      if (active) setOffset(value)
    }).catch(() => { if (active) setOffset(0) })
    return () => { active = false }
  }, [visible])

  const restore = () => {
    if (offset == null || !contentReady.current || restored.current || touched.current) return
    restored.current = true
    listRef.current?.scrollToOffset({ offset, animated: false })
  }
  useEffect(restore, [offset])

  const playRecord = async(item: LX.Music.MusicInfo) => {
    const current = recentState.recentPlayList.find(record => createPlayerMusicIdentity(record) == createPlayerMusicIdentity(item))
    if (!current || !isPlayableRecord(current)) {
      toast(t('phase1_record_unavailable'))
      return
    }
    await playMusicInfo(current, { listId: null, isTempPlay: true, clearTempList: false })
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme['c-content-background'] }}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.button}>
            <Text color={theme['c-primary-font']}>{t('phase1_back')}</Text>
          </TouchableOpacity>
          <Text size={20} style={styles.title}>{t('recent_play')}</Text>
          <Text size={12}>{list.length} / 520</Text>
        </View>
        {offset != null ? <FlatList
          ref={listRef}
          data={list}
          keyExtractor={createPlayerMusicIdentity}
          getItemLayout={(_, index) => ({ length: styles.row.height, offset: styles.row.height * index, index })}
          initialScrollIndex={list.length ? Math.min(Math.floor(offset / styles.row.height), list.length - 1) : undefined}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          onContentSizeChange={() => { contentReady.current = true; restore() }}
          onScrollBeginDrag={() => { touched.current = true }}
          onScroll={({ nativeEvent }) => {
            if (touched.current) void saveListPosition(POSITION_KEY, nativeEvent.contentOffset.y)
          }}
          scrollEventThrottle={200}
          ListEmptyComponent={<Text style={styles.empty}>{t('queue_empty')}</Text>}
          renderItem={({ item }) => {
            const playable = isPlayableRecord(item)
            return (
              <View style={[styles.row, { borderBottomColor: theme['c-border-background'] }]}>
                <TouchableOpacity style={styles.song} onPress={() => { void playRecord(item).catch(err => { toast(String(err.message ?? err)) }) }}>
                  <TrackArtwork musicInfo={item} size={44} />
                  <View style={styles.info}>
                    <Text numberOfLines={1}>{item.name}</Text>
                    <Text size={12} numberOfLines={1} color={theme['c-font-label']}>{playable ? item.singer : t('phase1_record_unavailable')}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('phase1_add_to_list')} disabled={!playable} style={styles.button} onPress={() => { addRef.current?.show({ musicInfo: item, listId: '', isMove: false }) }}>
                  <Text color={theme['c-font-label']}>＋</Text>
                </TouchableOpacity>
              </View>
            )
          }}
        /> : null}
        <MusicAddModal ref={addRef} />
      </View>
    </Modal>
  )
}

const styles = createStyle({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 56 },
  title: { flex: 1, fontWeight: '700' },
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  row: { height: 78, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 0.5 },
  song: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 68, paddingVertical: 8 },
  info: { flex: 1, paddingHorizontal: 12, gap: 4 },
  empty: { padding: 24, textAlign: 'center' },
})
