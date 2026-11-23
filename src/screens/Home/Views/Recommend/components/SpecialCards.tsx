import { memo, useEffect, useMemo, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { buildRecommendSpecialCards, DAILY_RECOMMEND_CARD_ID } from '@/core/netease/helpers'
import { loadDailyRecommendSongs, playDailyRecommend } from '@/store/dailyRecommend/action'
import { enterPrivateFmMode, preparePrivateFmQueue, PRIVATE_FM_TEMP_LIST_ID } from '@/store/privateFm/action'
import { usePrivateFmState } from '@/store/privateFm/hook'
import commonState from '@/store/common/state'
import { navigations } from '@/navigation'
import { LIST_IDS } from '@/config/constant'
import { pause, play } from '@/core/player/player'
import { useIsPlay, usePlayInfo } from '@/store/player/hook'
import listState from '@/store/list/state'
import { playSonglist } from '@/core/init/deeplink/playSonglist'

type RecommendCard = LX.Netease.Playlist & {
  isDailyRecommend?: boolean
  isPrivateFm?: boolean
  isPrivateRadar?: boolean
}

const buildSpecialCards = buildRecommendSpecialCards as (params: {
  dailySongs: LX.Music.MusicInfoOnline[]
  privateFmSongs: LX.Music.MusicInfoOnline[]
  recommendPlaylists: LX.Netease.Playlist[]
}) => RecommendCard[]

interface Props {
  recommendPlaylists: LX.Netease.Playlist[]
  refreshKey?: number
}

const getPlaylistTempListId = (playlist: LX.Netease.Playlist) => `${playlist.source}__${playlist.id}`

const SpecialCard = memo(({
  item,
  isPlaying,
  onOpen,
  onTogglePlay,
}: {
  item: RecommendCard
  isPlaying: boolean
  onOpen: (item: RecommendCard) => void
  onTogglePlay: (item: RecommendCard) => void
}) => {
  const theme = useTheme()

  return (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.86} onPress={() => { onOpen(item) }}>
        <View style={{ ...styles.coverWrap, backgroundColor: theme['c-primary-light-900-alpha-200'] }}>
          <Image url={item.img} style={styles.cover} />
          <View style={styles.coverShade} />
          <Text size={11} numberOfLines={1} color={theme['c-primary-font']} style={styles.kicker}>
            {item.isDailyRecommend ? 'Daily Mix' : item.isPrivateFm ? 'Private FM' : 'Radar'}
          </Text>
        </View>
        <Text size={14} numberOfLines={2} style={styles.cardTitle}>{item.name}</Text>
        <Text size={11} numberOfLines={1} color={theme['c-font-label']}>{item.desc ?? item.author}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.85}
        style={{
          ...styles.playBtn,
          backgroundColor: isPlaying ? theme['c-primary'] : theme['c-primary-light-500-alpha-700'],
        }}
        onPress={() => { onTogglePlay(item) }}
      >
        <Icon name={isPlaying ? 'pause' : 'play'} size={18} color={theme['c-primary-font']} />
      </TouchableOpacity>
    </View>
  )
})

export default memo(({ recommendPlaylists, refreshKey = 0 }: Props) => {
  const [dailySongs, setDailySongs] = useState<LX.Music.MusicInfoOnline[]>([])
  const privateFmState = usePrivateFmState()
  const playInfo = usePlayInfo()
  const isPlay = useIsPlay()

  useEffect(() => {
    let canceled = false
    const forceRefresh = refreshKey > 0
    void loadDailyRecommendSongs(forceRefresh).then((list) => {
      if (!canceled) setDailySongs([...list])
    }).catch(err => { console.log(err) })
    void preparePrivateFmQueue(forceRefresh).catch(err => { console.log(err) })
    return () => {
      canceled = true
    }
  }, [refreshKey])

  const cards = useMemo(() => {
    return buildSpecialCards({
      dailySongs,
      privateFmSongs: privateFmState.privateFmList,
      recommendPlaylists,
    })
  }, [dailySongs, privateFmState.privateFmList, recommendPlaylists])

  const isDailyPlayingList = () => playInfo.playerListId == LIST_IDS.TEMP && listState.tempListMeta.id == DAILY_RECOMMEND_CARD_ID
  const isPrivateFmPlayingList = () => playInfo.playerListId == LIST_IDS.TEMP && listState.tempListMeta.id == PRIVATE_FM_TEMP_LIST_ID
  const isPlaylistPlayingList = (playlist: LX.Netease.Playlist) => {
    return playInfo.playerListId == LIST_IDS.TEMP && listState.tempListMeta.id == getPlaylistTempListId(playlist)
  }

  const isCardPlaying = (card: RecommendCard) => {
    if (card.isDailyRecommend) return isDailyPlayingList() && isPlay
    if (card.isPrivateFm) return isPrivateFmPlayingList() && privateFmState.isPrivateFmActive && isPlay
    if (card.isPrivateRadar) return isPlaylistPlayingList(card) && isPlay
    return false
  }

  const openSonglist = (card: RecommendCard) => {
    if (!commonState.componentIds.home) return
    navigations.pushSonglistDetailScreen(commonState.componentIds.home, {
      ...card,
      desc: card.desc ?? undefined,
    })
  }

  const handleOpen = (card: RecommendCard) => {
    if (card.isPrivateFm) {
      void enterPrivateFmMode().catch(err => { console.log(err) })
      return
    }
    openSonglist(card)
  }

  const handleToggleDaily = () => {
    if (isDailyPlayingList()) {
      if (isPlay) void pause()
      else play()
      return
    }
    void playDailyRecommend().catch(err => { console.log(err) })
  }

  const handleTogglePrivateFm = () => {
    if (privateFmState.isPrivateFmActive) {
      if (isPlay) void pause()
      else play()
      return
    }
    void enterPrivateFmMode().catch(err => { console.log(err) })
  }

  const handleTogglePlaylist = (card: RecommendCard) => {
    if (isPlaylistPlayingList(card)) {
      if (isPlay) void pause()
      else play()
      return
    }
    void playSonglist(card.source, card.id).catch(err => { console.log(err) })
  }

  const handleTogglePlay = (card: RecommendCard) => {
    if (card.isDailyRecommend) {
      handleToggleDaily()
      return
    }
    if (card.isPrivateFm) {
      handleTogglePrivateFm()
      return
    }
    handleTogglePlaylist(card)
  }

  if (!cards.length) return null

  return (
    <View style={styles.section}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={cards}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SpecialCard
            item={item}
            isPlaying={isCardPlaying(item)}
            onOpen={handleOpen}
            onTogglePlay={handleTogglePlay}
          />
        )}
      />
    </View>
  )
})

const styles = createStyle({
  section: {
    paddingBottom: 14,
  },
  list: {
    paddingHorizontal: 12,
    gap: 12,
  },
  card: {
    width: 168,
  },
  coverWrap: {
    width: 168,
    height: 168,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cover: {
    width: 168,
    height: 168,
  },
  coverShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 54,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  kicker: {
    position: 'absolute',
    left: 10,
    top: 9,
    fontWeight: '700',
  },
  cardTitle: {
    paddingTop: 7,
    minHeight: 42,
    fontWeight: '700',
  },
  playBtn: {
    position: 'absolute',
    right: 10,
    top: 124,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
