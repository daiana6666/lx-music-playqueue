import { memo, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, SectionList, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import TrackArtwork from '@/components/TrackArtwork'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle, toast } from '@/utils/tools'
import { clearTempPlayeList } from '@/core/player/tempPlayList'
import { getPlaybackQueue, playPlaybackQueueItem, removePlaybackQueueItem } from '@/core/player/queueActions'
import { getTargetMusicInfo, type QueueRow, type QueueSection } from '@/core/player/queue'
import { event as dislikeEvent } from '@/store/dislikeList/event'

export default memo(({ visible, onClose }: { visible: boolean, onClose: () => void }) => {
  const t = useI18n()
  const theme = useTheme()
  const mode = useSettingValue('player.togglePlayMethod')
  const [sections, setSections] = useState(getPlaybackQueue)
  const listRef = useRef<SectionList<QueueRow, QueueSection>>(null)
  const acting = useRef(false)

  useEffect(() => {
    if (!visible) return
    const update = () => { setSections(getPlaybackQueue()) }
    update()
    const events = ['playMusicInfoChanged', 'playInfoChanged', 'playPlayedListChanged', 'playTempPlayListChanged', 'playQueueUpdated', 'partyRoomUpdated', 'configUpdated'] as const
    for (const event of events) global.state_event.on(event, update)
    global.app_event.on('myListMusicUpdate', update)
    dislikeEvent.on('dislike_changed', update)
    return () => {
      for (const event of events) global.state_event.off(event, update)
      global.app_event.off('myListMusicUpdate', update)
      dislikeEvent.off('dislike_changed', update)
    }
  }, [visible])

  const select = async(item: QueueRow) => {
    if (acting.current) return
    acting.current = true
    try { await playPlaybackQueueItem(item) } catch (err: any) { toast(String(err.message ?? err)) } finally { acting.current = false }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.mask}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel={t('phase1_back')} />
        <View style={[styles.panel, { backgroundColor: theme['c-content-background'] }]}>
          <View style={styles.header}>
            <Text size={18} style={styles.title}>{t('queue_title')}</Text>
            <TouchableOpacity style={styles.button} onPress={() => { listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: true }) }} disabled={!sections.length}>
              <Text size={12}>{t('phase1_queue_locate')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={onClose}><Text>{t('phase1_back')}</Text></TouchableOpacity>
          </View>
          {mode == 'random' ? <Text size={11} color={theme['c-font-label']} style={styles.hint}>{t('phase1_queue_random')}</Text> : null}
          <SectionList<QueueRow, QueueSection>
            ref={listRef}
            sections={sections}
            keyExtractor={item => item.key}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={7}
            stickySectionHeadersEnabled
            onScrollToIndexFailed={() => { listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: true }) }}
            ListEmptyComponent={<Text style={styles.empty}>{t('queue_empty')}</Text>}
            renderSectionHeader={({ section }) => (
              <View style={[styles.section, { backgroundColor: theme['c-content-background'] }]}>
                <Text size={12} style={styles.title} color={theme['c-font-label']}>{t(`phase1_queue_${section.kind}`)} · {section.data.length}</Text>
                {section.kind == 'later' ? <TouchableOpacity onPress={clearTempPlayeList} style={styles.button}><Text size={12}>{t('phase1_queue_clear')}</Text></TouchableOpacity> : null}
              </View>
            )}
            renderItem={({ item }) => {
              const music = getTargetMusicInfo(item.entry.musicInfo)
              return (
                <View style={[styles.row, { backgroundColor: item.kind == 'current' ? theme['c-primary-light-900-alpha-200'] : 'transparent' }]}>
                  <TouchableOpacity style={styles.song} onPress={() => { void select(item) }}>
                    <TrackArtwork musicInfo={music} />
                    <View style={styles.info}>
                      <Text numberOfLines={1}>{music.name}</Text>
                      <Text size={12} numberOfLines={1} color={theme['c-font-label']}>{music.singer}</Text>
                    </View>
                  </TouchableOpacity>
                  {item.kind == 'later' ? <TouchableOpacity accessibilityLabel={t('list_remove')} style={styles.button} onPress={() => { removePlaybackQueueItem(item) }}><Text>×</Text></TouchableOpacity> : null}
                </View>
              )
            }}
          />
        </View>
      </View>
    </Modal>
  )
})

const styles = createStyle({
  mask: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  dismiss: { flex: 1 },
  panel: { height: '72%', borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingHorizontal: 12, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  title: { flex: 1, fontWeight: '700' },
  button: { minWidth: 44, minHeight: 44, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  hint: { paddingBottom: 8 },
  section: { flexDirection: 'row', alignItems: 'center', minHeight: 38 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 6 },
  song: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 8, paddingLeft: 6 },
  info: { flex: 1, paddingHorizontal: 12, gap: 4 },
  empty: { padding: 24, textAlign: 'center' },
})
